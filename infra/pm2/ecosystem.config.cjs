module.exports = {
  apps: [
    {
      name: 'pokewar',
      cwd: '/opt/pokewar/current',
      script: 'apps/server/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=512 --enable-source-maps',
      max_memory_restart: '700M',
      kill_timeout: 8000,
      listen_timeout: 10000,
      time: true,
      merge_logs: true,
      out_file: '/var/log/pokewar/out.log',
      error_file: '/var/log/pokewar/error.log',
      env_production: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '8080',
        DATABASE_PATH: '/var/lib/pokewar/pokewar.sqlite',
        MAX_ROOMS: '200',
        MAX_CONNECTIONS: '800',
        LOG_LEVEL: 'info'
      }
    }
  ]
};
