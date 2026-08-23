import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';
import { RabbitMQConsumer } from './plugins/tenant/rabbitmq/rabbitmq.consumer';

bootstrapWorker(config)
    .then(async worker => {
        await worker.startJobQueue();

        // Start RabbitMQ consumer in the worker process
        const consumer = worker.app.get(RabbitMQConsumer);
        await consumer.startConsuming();
    })
    .catch(err => {
        console.log(err);
    });
