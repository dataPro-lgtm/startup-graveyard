/**
 * PM2 Ecosystem配置文件
 * 用于生产环境部署
 */
module.exports = {
  apps: [
    {
      name: 'startup-graveyard',
      script: 'npm',
      args: 'start',
      cwd: process.cwd(),
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // 日志配置
      error_file: '/var/log/pm2/startup-graveyard-error.log',
      out_file: '/var/log/pm2/startup-graveyard-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // 自动重启配置
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      
      // 启动延迟
      min_uptime: '10s',
      max_restarts: 10,
      
      // 环境变量文件
      env_file: '.env',
    },
  ],
};
