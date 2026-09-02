import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Logger, ProcessContext } from '@vendure/core';
import amqp from 'amqplib';
import {
    RABBITMQ_EXCHANGE,
    RABBITMQ_QUEUE,
    RABBITMQ_DLX_EXCHANGE,
    RABBITMQ_DLQ,
} from './rabbitmq.constants';
import { RabbitMQMessageHandler } from './rabbitmq.handler';

const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 0; // 0 = infinite

@Injectable()
export class RabbitMQConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
    private connection: amqp.ChannelModel | null = null;
    private channel: amqp.Channel | null = null;
    private started = false;
    private shuttingDown = false;
    private reconnectAttempts = 0;

    constructor(
        private processContext: ProcessContext,
        private messageHandler: RabbitMQMessageHandler,
    ) {}

    async onApplicationBootstrap() {
        // no-op — consumer is started manually from index-worker.ts
    }

    async startConsuming() {
        if (this.started) return;
        this.started = true;
        await this.connect();
    }

    private async connect() {
        const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

        try {
            // Connect with heartbeat (30s) to keep connection alive
            const connectUrl = url.includes('?') ? `${url}&heartbeat=30` : `${url}?heartbeat=30`;
            this.connection = await amqp.connect(connectUrl);

            // Handle connection errors + close → reconnect
            this.connection.on('error', (err) => {
                Logger.error(`Connection error: ${err.message}`, 'RabbitMQ');
            });
            this.connection.on('close', () => {
                if (!this.shuttingDown) {
                    Logger.warn('Connection closed. Reconnecting...', 'RabbitMQ');
                    this.scheduleReconnect();
                }
            });

            this.channel = await this.connection.createChannel();

            // Handle channel errors + close → reconnect
            this.channel.on('error', (err) => {
                Logger.error(`Channel error: ${err.message}`, 'RabbitMQ');
            });
            this.channel.on('close', () => {
                if (!this.shuttingDown) {
                    Logger.warn('Channel closed. Reconnecting...', 'RabbitMQ');
                    this.scheduleReconnect();
                }
            });

            const ch = this.channel;

            // Dead letter exchange + queue
            await ch.assertExchange(RABBITMQ_DLX_EXCHANGE, 'topic', { durable: true });
            await ch.assertQueue(RABBITMQ_DLQ, { durable: true });
            await ch.bindQueue(RABBITMQ_DLQ, RABBITMQ_DLX_EXCHANGE, '#');

            // Main exchange (topic)
            await ch.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });

            // Main queue with DLX
            await ch.assertQueue(RABBITMQ_QUEUE, {
                durable: true,
                arguments: { 'x-dead-letter-exchange': RABBITMQ_DLX_EXCHANGE },
            });

            // Bind routing key patterns
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'company.*');
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'tenant.*');
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'channel.*');
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'admin.*');
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'product.*');
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'stock.*');
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'sync.*');

            await ch.prefetch(1);

            // Consume
            await ch.consume(RABBITMQ_QUEUE, async (msg) => {
                if (!msg) return;
                const routingKey = msg.fields.routingKey;
                const content = msg.content.toString();

                try {
                    const payload = JSON.parse(content);
                    Logger.info(`Received: ${routingKey}`, 'RabbitMQ');
                    await this.messageHandler.handle(routingKey, payload);
                    ch.ack(msg);
                    Logger.info(`Processed: ${routingKey}`, 'RabbitMQ');
                } catch (error: any) {
                    Logger.error(`Error processing ${routingKey}: ${error.message}`, 'RabbitMQ', error.stack);
                    ch.nack(msg, false, false);
                }
            });

            this.reconnectAttempts = 0;
            Logger.info(`Connected — consuming "${RABBITMQ_QUEUE}" (heartbeat: 30s)`, 'RabbitMQ');
        } catch (error: any) {
            Logger.warn(`Connection failed: ${error.message}`, 'RabbitMQ');
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        if (this.shuttingDown) return;
        if (MAX_RECONNECT_ATTEMPTS > 0 && this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Logger.error(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`, 'RabbitMQ');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(RECONNECT_DELAY_MS * this.reconnectAttempts, 30000); // max 30s backoff
        Logger.info(`Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`, 'RabbitMQ');

        // Clean up old connection
        try { this.channel?.removeAllListeners(); } catch (_) {}
        try { this.connection?.removeAllListeners(); } catch (_) {}
        this.channel = null;
        this.connection = null;

        setTimeout(() => this.connect(), delay);
    }

    async onApplicationShutdown() {
        this.shuttingDown = true;
        try {
            await this.channel?.close();
            await this.connection?.close();
        } catch (_) {}
    }
}
