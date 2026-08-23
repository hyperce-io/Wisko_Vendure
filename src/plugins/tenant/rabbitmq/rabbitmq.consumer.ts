import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Logger, ProcessContext } from '@vendure/core';
import amqp from 'amqplib';
import {
    RABBITMQ_EXCHANGE,
    RABBITMQ_QUEUE,
    RABBITMQ_DLX_EXCHANGE,
    RABBITMQ_DLQ,
    ROUTING_KEYS,
} from './rabbitmq.constants';
import { RabbitMQMessageHandler } from './rabbitmq.handler';

@Injectable()
export class RabbitMQConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
    private connection: amqp.ChannelModel | null = null;
    private channel: amqp.Channel | null = null;

    constructor(
        private processContext: ProcessContext,
        private messageHandler: RabbitMQMessageHandler,
    ) {}

    async onApplicationBootstrap() {
        if (!this.processContext.isServer) return;

        const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

        try {
            this.connection = await amqp.connect(url);
            this.channel = await this.connection.createChannel();
            const ch = this.channel;

            // Dead letter exchange + queue
            await ch.assertExchange(RABBITMQ_DLX_EXCHANGE, 'fanout', { durable: true });
            await ch.assertQueue(RABBITMQ_DLQ, { durable: true });
            await ch.bindQueue(RABBITMQ_DLQ, RABBITMQ_DLX_EXCHANGE, '');

            // Main exchange (topic)
            await ch.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });

            // Main queue with DLX
            await ch.assertQueue(RABBITMQ_QUEUE, {
                durable: true,
                arguments: { 'x-dead-letter-exchange': RABBITMQ_DLX_EXCHANGE },
            });

            // Bind routing keys
            for (const key of Object.values(ROUTING_KEYS)) {
                await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, key);
            }
            // Wildcard patterns
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'company.*');
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'tenant.*');
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'channel.*');
            await ch.bindQueue(RABBITMQ_QUEUE, RABBITMQ_EXCHANGE, 'admin.*');
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
                    ch.nack(msg, false, false); // to DLQ
                }
            });

            Logger.info(`Connected — consuming "${RABBITMQ_QUEUE}" (exchange: "${RABBITMQ_EXCHANGE}")`, 'RabbitMQ');
        } catch (error: any) {
            Logger.warn(`RabbitMQ not available: ${error.message}. Sync via RabbitMQ disabled.`, 'RabbitMQ');
        }
    }

    async onApplicationShutdown() {
        try {
            await this.channel?.close();
            await this.connection?.close();
            Logger.info('Connection closed', 'RabbitMQ');
        } catch (_) {}
    }
}
