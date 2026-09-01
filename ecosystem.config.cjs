module.exports = {
    apps: [
        {
            name: 'wisko-backend',
            script: 'node_modules/.bin/vendure',
            args: 'start all',
            cwd: '/home/devops/wisko/backend',
            max_memory_restart: '3G',
            restart_delay: 5000,
            max_restarts: 10,
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
