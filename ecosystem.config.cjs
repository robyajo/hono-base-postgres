module.exports = {
  apps: [
    {
      name: "hono-base-postgres",
      script: "./src/index.ts",
      interpreter: "bun",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      exp_backoff_restart_delay: 100,
      env: {
        APP_ENV: "production",
        NODE_ENV: "production",
        PORT: 8000,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./src/storage/log/pm2-error.log",
      out_file: "./src/storage/log/pm2-combined.log",
      merge_logs: true,
      time: true,
      kill_timeout: 3000,
    },
  ],
};
