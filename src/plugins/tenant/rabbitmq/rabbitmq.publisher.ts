import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Logger } from '@vendure/core';
import amqp from 'amqplib';
import { RABBITMQ_EXCHANGE } from './rabbitmq.constants';

@Injectable()
export class RabbitMQPublisher implements OnApplicationShutdown {
    private connection: amqp.ChannelModel | null = null;
    private channel: amqp.Channel | null = null;
    private connecting = false;

    private async ensureConnection(): Promise<amqp.Channel | null> {
        if (this.channel) return this.channel;
        if (this.connecting) return null;

        this.connecting = true;
        const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

        try {
            const connectUrl = url.includes('?') ? `${url}&heartbeat=30` : `${url}?heartbeat=30`;
            this.connection = await amqp.connect(connectUrl);

            this.connection.on('error', (err) => {
                Logger.error(`Publisher connection error: ${err.message}`, 'RabbitMQPublisher');
                this.channel = null;
                this.connection = null;
            });
            this.connection.on('close', () => {
                this.channel = null;
                this.connection = null;
            });

            this.channel = await this.connection.createChannel();
            await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });

            this.channel.on('error', () => { this.channel = null; });
            this.channel.on('close', () => { this.channel = null; });

            Logger.info('Publisher connected', 'RabbitMQPublisher');
            return this.channel;
        } catch (error: any) {
            Logger.warn(`Publisher connection failed: ${error.message}`, 'RabbitMQPublisher');
            return null;
        } finally {
            this.connecting = false;
        }
    }

    async publish(routingKey: string, payload: Record<string, any>): Promise<boolean> {
        const ch = await this.ensureConnection();
        if (!ch) {
            Logger.warn(`Cannot publish ${routingKey}: not connected`, 'RabbitMQPublisher');
            return false;
        }

        try {
            const message = Buffer.from(JSON.stringify(payload));
            ch.publish(RABBITMQ_EXCHANGE, routingKey, message, {
                persistent: true,
                contentType: 'application/json',
                timestamp: Math.floor(Date.now() / 1000),
            });
            Logger.info(`Published: ${routingKey}`, 'RabbitMQPublisher');
            return true;
        } catch (error: any) {
            Logger.error(`Publish failed ${routingKey}: ${error.message}`, 'RabbitMQPublisher');
            return false;
        }
    }

    async onApplicationShutdown() {
        try {
            await this.channel?.close();
            await this.connection?.close();
        } catch (_) {}
    }
}
