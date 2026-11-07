// Starts a dev server against a named database (AGENTS.md, "Sign in as a real account"):
//
//   npm run dev:against -- prod                 this checkout's code, the production database, port 3021
//   npm run dev:against -- staging --port=3022
//   npm run dev:against -- prod --dir=../Tracker-staging   another checkout's code (a git worktree with node_modules)
//
// It loads this checkout's .env.local, puts the named database's connection strings into DATABASE_URL and
// DATABASE_URL_DIRECT, points BETTER_AUTH_URL at the chosen port (Better Auth's redirects go there) and runs
// `next dev` in --dir (default: here). Names are resolved the way scripts/db-copy.ts resolves them.
//
// Every save in that server is a real write to that database. Against production, test mode is switched off
// (TEST_MODE_SECRET is blanked), so the seeded personas and the walkthroughs cannot run there: it is for reading
// your own account and posting on your own tasks (scripts/agent-session.mjs), nothing else.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { databaseUrls, describeUrl, isProductionName } from "./agent-session.mjs";

const [name = "local", ...flags] = process.argv.slice(2);
const flag = (key, fallback) => flags.find((f) => f.startsWith(`--${key}=`))?.split("=").slice(1).join("=") ?? fallback;
const port = Number(flag("port", "3021"));
const dir = path.resolve(flag("dir", "."));
if (!Number.isInteger(port) || port <= 0) {
  console.error(`dev:against: --port must be a number (got ${flag("port", "3021")})`);
  process.exit(1);
}
const nextBin = path.join(dir, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) {
  console.error(`dev:against: no node_modules/next in ${dir} (run npm ci there, or point node_modules at this checkout's)`);
  process.exit(1);
}

const target = databaseUrls(name);
const env = {
  ...process.env,
  DATABASE_URL: target.pooled,
  DATABASE_URL_DIRECT: target.direct,
  BETTER_AUTH_URL: `http://localhost:${port}`,
  ...(isProductionName(target.name) ? { TEST_MODE_SECRET: "" } : {}),
};
console.log(`dev:against: ${target.name} database (${describeUrl(target.pooled)}) · http://localhost:${port} · code in ${dir}${isProductionName(target.name) ? " · test mode OFF" : ""}`);
console.log("dev:against: every save here is a real write to that database.");

const child = spawn(process.execPath, [nextBin, "dev", "--port", String(port)], { cwd: dir, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
