import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';
import { RabbitMQConsumer } from './plugins/tenant/rabbitmq/rabbitmq.consumer';

process.on('uncaughtException', (err) => {
    console.error('[WORKER UNCAUGHT EXCEPTION]', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error('[WORKER UNHANDLED REJECTION]', reason);
});

bootstrapWorker(config)
    .then(async worker => {
        await worker.startJobQueue();
        const consumer = worker.app.get(RabbitMQConsumer);
        await consumer.startConsuming();
    })
    .catch(err => {
        console.error('[WORKER BOOTSTRAP ERROR]', err);
        process.exit(1);
    });
