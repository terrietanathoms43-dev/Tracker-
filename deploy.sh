#!/bin/bash
#
# Deploy on the VPS: run from a checkout's directory as the app user. GitHub Actions runs it over SSH after a
# push to main or staging passes the quality checks (docs/RUNBOOK.md); it can also be run by hand.
#
# The checkout's branch decides the environment: `main` is production (pm2 app `tracker`, port 3015,
# ecosystem.config.js) and `staging` is staging (`tracker-staging`, port 3016, ecosystem.staging.config.js).
# Pull (fast-forward only: a server checkout never has commits of its own), install, apply additive staging schema
# changes, build, then (re)start under pm2. Production schema changes are pushed separately before a release.
# POSIX only (`set -eu`, no `pipefail`): the VPS runs this with `sh`, which is dash there, and dash refuses
# bash-only options. There are no pipes in this script. `-e` matters: a failed build must not restart pm2.
set -eu
cd "$(dirname "$0")"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
case "$BRANCH" in
  main) ECOSYSTEM=ecosystem.config.js ;;
  staging) ECOSYSTEM=ecosystem.staging.config.js ;;
  *)
    echo "deploy.sh: this checkout is on '$BRANCH'; only main (production) and staging are deployed." >&2
    exit 1
    ;;
esac

echo "==> Pulling latest (branch: $BRANCH)"
git pull --ff-only origin "$BRANCH"

echo "==> Installing dependencies (npm ci)"
npm ci

if [ "$BRANCH" = "staging" ]; then
  echo "==> Applying additive staging schema changes (npm run db:push)"
  npm run db:push
fi

echo "==> Building app"
npm run build

echo "==> Starting/Restarting pm2 app from $ECOSYSTEM"
pm2 startOrRestart "$ECOSYSTEM"
pm2 save

echo ""
echo "Deployment of $BRANCH complete."
