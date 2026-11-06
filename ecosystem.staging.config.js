// pm2 process definition for the staging environment: the `staging` branch checked out in its own directory on
// the VPS (docs/RUNBOOK.md, "Staging"), with its own .env.local (its own BETTER_AUTH_URL and a staging database).
// The same process as production (ecosystem.config.js) under another name on another port, so the two run side
// by side; deploy.sh picks this file when its checkout is on `staging`.
//
//   pm2 start ecosystem.staging.config.js   # first run, in the staging checkout
//   ./deploy.sh                             # pull + install + build + (re)start
//
// pm2 loads ecosystem files with require(), so this stays CommonJS like ecosystem.config.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const [production] = require("./ecosystem.config.js").apps;

module.exports = {
  apps: [{ ...production, name: "tracker-staging", args: "start -p 3016" }],
};
