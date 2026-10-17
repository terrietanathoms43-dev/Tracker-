// Runs every walkthrough (0N-*.mjs, in order), sums them up, puts the demo workspaces back, and sets the exit code.
// Needs a dev server (port 3020 by default) and `npm run test:seed` done once.
//
// Usage: npm run test:walk
//        node scripts/test-walkthrough/run-all.mjs [--skip=02] [--only=01,03] [--base=http://localhost:3021]
//   --only / --skip take script number prefixes here; --base is passed on to every script.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tidy } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const list = (name) => (flag(name) ?? "").split(",").filter(Boolean);
const skip = list("skip");
const only = list("only");
const passOn = args.filter((arg) => arg.startsWith("--base="));

const scripts = readdirSync(here)
  .filter((name) => /^\d\d-.*\.mjs$/.test(name))
  .sort()
  .filter((name) => !skip.some((prefix) => name.startsWith(prefix)))
  .filter((name) => only.length === 0 || only.some((prefix) => name.startsWith(prefix)));

const results = [];
for (const script of scripts) {
  console.log(`\n=================== ${script} ===================`);
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(here, script), ...passOn], { stdio: "inherit" });
  results.push({ script, ok: run.status === 0, seconds: Math.round((Date.now() - started) / 1000) });
}

// Leave the demo workspaces as they were found, even when a script failed half way.
let tidied = true;
try {
  tidy();
} catch (error) {
  tidied = false;
  console.log(error instanceof Error ? error.message : String(error));
}

console.log("\n=================== summary ===================");
for (const result of results) console.log(`${result.ok ? "ok  " : "FAIL"} ${result.script} (${result.seconds}s)`);
if (!tidied) console.log("FAIL tidy (run npm run test:tidy by hand)");
const passed = results.filter((result) => result.ok).length;
console.log(`${passed} of ${results.length} walkthrough(s) passed.`);
process.exitCode = results.length > 0 && passed === results.length && tidied ? 0 : 1;
