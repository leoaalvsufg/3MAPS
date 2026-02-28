/**
 * PM2 ecosystem config para 3Maps
 * Uso no servidor: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [{
    name: '3maps',
    script: 'server/cluster.js',
    // pm2 usa o diretório do config por padrão
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 8787,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 8787,
    },
    error_file: './logs/3maps-err.log',
    out_file: './logs/3maps-out.log',
  }],
};
