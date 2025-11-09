module.exports = {
  apps: [
    {
      name: 'api-gateway',
      script: './api-gateway/server.js',
      env: {
        PORT: process.env.PORT || 3000,
      }
    },
    {
      name: 'auth-service',
      script: './services/auth-service/server.js',
      env: {
        PORT: 3001,
      }
    },
    {
      name: 'user-service',
      script: './services/user-service/server.js',
      env: {
        PORT: 3002,
      }
    },
    {
      name: 'invoice-service',
      script: './services/invoice-service/server.js',
      env: {
        PORT: 3003,
      }
    }
  ]
};
