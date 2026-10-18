#!/bin/bash
#
# Deploy on the VPS: run from the repo directory as the app user.
# Pull, install, build, then (re)start under pm2. Schema changes are applied deliberately,
# not on every deploy: run `npm run db:push` yourself when a release changes db/schema.ts.
set -euo pipefail

echo "==> Pulling latest (branch: main)"
git pull origin main

echo "==> Installing dependencies (npm ci)"
npm ci

echo "==> Building app"
npm run build

echo "==> Starting/Restarting pm2 app from ecosystem.config.js"
pm2 startOrRestart ecosystem.config.js
pm2 save

echo ""
echo "Deployment complete."
