// Messages from the Wisko role relay (wisko-auth docs/role-sync.md §4), applied in the worker (src/index-worker.ts).
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Logger, TransactionalConnection } from '@vendure/core';
import amqp, { Channel, ChannelModel, ConsumeMessage, RecoveringChannelModel } from 'amqplib';

import {
    CATALOG_ROUTING_KEY,
    loggerCtx,
    RETRY_DELAYS_SECONDS,
    ROLE_SYNC_DEAD_QUEUE,
    ROLE_SYNC_EXCHANGE,
    ROLE_SYNC_QUEUE,
    USER_ROLES_ROUTING_KEY,
    ZITADEL_PLUGIN_OPTIONS,
} from '../constants';
import { WiskoRoleService } from '../services/wisko-role.service';
import { ZitadelContextService } from '../services/zitadel-context.service';
import { VendureRoleCatalog, ZitadelPluginOptions } from '../types';
import { fetchDeployedCatalog } from '../zitadel-api';
import { isRecord, parseRoleCatalog, parseUserRolesMessage } from './role-sync.payload';

const HEARTBEAT_SECONDS = 30;
const MAX_RECONNECT_DELAY_MS = 30000;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

@Injectable()
export class RoleSyncConsumer implements OnApplicationShutdown {
    private brokerConnection: RecoveringChannelModel | null = null;
    /** Kept in memory: read from ZITADEL at start, replaced by newer roles.catalog messages. */
    private catalog: VendureRoleCatalog | null = null;

    constructor(
        @Inject(ZITADEL_PLUGIN_OPTIONS) private options: ZitadelPluginOptions,
        private connection: TransactionalConnection,
        private contextService: ZitadelContextService,
        private wiskoRoleService: WiskoRoleService,
    ) {}

    async startConsuming(): Promise<void> {
        if (!this.options.rabbitmqUrl) {
            Logger.error('RABBITMQ_URL is not set: ZITADEL role sync is off', loggerCtx);
            return;
        }
        await this.loadDeployedCatalog().catch(error =>
            Logger.warn(`Could not read the deployed role catalog from ZITADEL (${errorText(error)}); trying again on the first message`, loggerCtx),
        );
        const url = new URL(this.options.rabbitmqUrl);
        url.searchParams.set('heartbeat', String(HEARTBEAT_SECONDS));
        this.brokerConnection = await amqp.connect(url.toString(), {
            recovery: { maxDelay: MAX_RECONNECT_DELAY_MS, setup: (model: ChannelModel) => this.setupChannel(model) },
        });
        this.brokerConnection.on('disconnect', error => Logger.warn(`Role sync disconnected from RabbitMQ: ${error.message}`, loggerCtx));
        this.brokerConnection.on('error', error => Logger.error(`Role sync RabbitMQ error: ${error.message}`, loggerCtx));
    }

    async onApplicationShutdown() {
        await this.brokerConnection?.close().catch(() => undefined);
        this.brokerConnection = null;
    }

    private async setupChannel(model: ChannelModel): Promise<void> {
        const channel = await model.createChannel();
        channel.on('error', error => Logger.error(`Role sync channel error: ${error.message}`, loggerCtx));
        await channel.assertExchange(ROLE_SYNC_EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(ROLE_SYNC_QUEUE, { durable: true, arguments: { 'x-single-active-consumer': true } });
        await channel.assertQueue(ROLE_SYNC_DEAD_QUEUE, { durable: true });
        await channel.bindQueue(ROLE_SYNC_QUEUE, ROLE_SYNC_EXCHANGE, USER_ROLES_ROUTING_KEY);
        await channel.bindQueue(ROLE_SYNC_QUEUE, ROLE_SYNC_EXCHANGE, CATALOG_ROUTING_KEY);
        // One at a time keeps each person's messages in order.
        await channel.prefetch(1);
        await channel.consume(ROLE_SYNC_QUEUE, message => {
            if (message) void this.processMessage(channel, message);
        });
        Logger.info(`Consuming "${ROLE_SYNC_QUEUE}"`, loggerCtx);
    }

    private async loadDeployedCatalog(): Promise<VendureRoleCatalog> {
        const deployedCatalog = await fetchDeployedCatalog(this.options);
        this.useCatalog(deployedCatalog);
        return deployedCatalog;
    }

    private useCatalog(catalog: VendureRoleCatalog): void {
        if (this.catalog && catalog.version <= this.catalog.version) {
            Logger.verbose(`Ignored role catalog version ${catalog.version}: version ${this.catalog.version} is in use`, loggerCtx);
            return;
        }
        this.catalog = catalog;
        Logger.info(`Using role catalog version ${catalog.version} (${catalog.rolePermissions.size} Store roles)`, loggerCtx);
    }

    private async handle(routingKey: string, payload: unknown): Promise<void> {
        if (routingKey === CATALOG_ROUTING_KEY) {
            this.useCatalog(parseRoleCatalog(payload));
            return;
        }
        const message = parseUserRolesMessage(payload);
        const catalog = this.catalog ?? (await this.loadDeployedCatalog());
        const ctx = await this.contextService.superAdminContext();
        await this.connection.withTransaction(ctx, transactionCtx =>
            this.wiskoRoleService.applyUserRoles(transactionCtx, message, catalog),
        );
    }

    private async handleWithRetries(routingKey: string, payload: unknown): Promise<void> {
        for (const delaySeconds of RETRY_DELAYS_SECONDS) {
            try {
                await this.handle(routingKey, payload);
                return;
            } catch (error) {
                Logger.warn(`${routingKey} failed (${errorText(error)}); retrying in ${delaySeconds} s`, loggerCtx);
                await wait(delaySeconds * 1000);
            }
        }
        await this.handle(routingKey, payload);
    }

    private async processMessage(channel: Channel, message: ConsumeMessage): Promise<void> {
        const { routingKey } = message.fields;
        try {
            try {
                const payload: unknown = JSON.parse(message.content.toString('utf8'));
                const messageType = isRecord(payload) ? payload.type : undefined;
                if (messageType !== routingKey) {
                    this.deadLetter(channel, message, `message type ${JSON.stringify(messageType)} does not match the routing key`);
                } else {
                    await this.handleWithRetries(routingKey, payload);
                }
            } catch (error) {
                this.deadLetter(channel, message, `failed after every retry (${errorText(error)})`);
            }
            channel.ack(message);
        } catch (error) {
            Logger.warn(`Could not finish ${routingKey}; it will be redelivered: ${errorText(error)}`, loggerCtx);
        }
    }

    private deadLetter(channel: Channel, message: ConsumeMessage, reason: string): void {
        const { routingKey } = message.fields;
        Logger.error(`${routingKey} ${reason}; moved to ${ROLE_SYNC_DEAD_QUEUE}`, loggerCtx);
        channel.sendToQueue(ROLE_SYNC_DEAD_QUEUE, message.content, {
            persistent: true,
            contentType: message.properties.contentType,
            messageId: message.properties.messageId,
            timestamp: message.properties.timestamp,
            headers: { ...message.properties.headers, 'x-wisko-routing-key': routingKey, 'x-wisko-error': reason },
        });
    }
}
