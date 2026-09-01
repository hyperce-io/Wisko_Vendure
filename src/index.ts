import { bootstrap, runMigrations } from '@vendure/core';
import { config } from './vendure-config';

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

runMigrations(config)
    .then(() => bootstrap(config))
    .catch(err => {
        console.error('[BOOTSTRAP ERROR]', err);
        process.exit(1);
    });
