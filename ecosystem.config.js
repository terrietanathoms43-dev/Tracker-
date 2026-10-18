// pm2 process definition for Trackwise on the VPS.
//
//   npm i -g pm2
//   pm2 start ecosystem.config.js     # first run
//   ./deploy.sh                       # pull + install + build + (re)start
//
// Runs the Next binary directly (needs a prior `next build`) so pm2 owns the server process:
// memory stats, max_memory_restart and signals all work. Secrets come from .env.local on the server.
module.exports = {
  apps: [
    {
      name: "tracker",
      cwd: "./",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3015",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 4000,
      // Surface crashes early instead of hot-looping on a bad config/env.
      min_uptime: "20s",
      max_memory_restart: "600M",
      env: { NODE_ENV: "production" },
    },
  ],
};
