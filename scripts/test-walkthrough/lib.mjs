// Shared by the walkthrough scripts: step logging with a pass / fail summary, browsers that always get closed,
// argument flags, the seeded people and workspaces (keep in step with lib/test-mode.ts), one-off database reads,
// and the tidy-up that puts the demo workspaces back after a run.
//
// A new walkthrough is a file named 0N-<flow>.mjs that imports from here, makes one step() per assertion (with a
// sentence a person can read), and ends with finish() and closePool(). run-all.mjs picks it up by its name.
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { Pool } from "pg";
import { cleanPath, DEFAULT_BASE_URL, openBrowser as openRawBrowser, PERSONAS, sleep, testSecret } from "../test-browser.mjs";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

export { cleanPath, PERSONAS, sleep, testSecret };

// --- arguments ----------------------------------------------------------------------------

const args = process.argv.slice(2);
export const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
export const hasFlag = (name) => args.includes(`--${name}`);
/** --only=landing,guard runs just those parts of a script. */
export const only = (part) => flag("only") === undefined || flag("only").split(",").includes(part);

/** The dev server under test: --base=…, else TEST_BASE_URL, else the owner's port 3020. */
export const BASE_URL = flag("base") ?? DEFAULT_BASE_URL;

// --- the seeded data (the same values as lib/test-mode.ts, which a .mjs script cannot import) ----------

export const TEST_DOMAIN = "@trackwise.test";
export const PEOPLE = {
  admin: { email: `avery${TEST_DOMAIN}`, name: "Avery Admin", org: "demo", role: "admin" },
  leader: { email: `morgan${TEST_DOMAIN}`, name: "Morgan Lead", org: "demo", role: "leader" },
  member: { email: `jordan${TEST_DOMAIN}`, name: "Jordan Dev", org: "demo", role: "member" },
  member2: { email: `sam${TEST_DOMAIN}`, name: "Sam Dev", org: "demo", role: "member" },
  stakeholder: { email: `taylor${TEST_DOMAIN}`, name: "Taylor Ops", org: "demo", role: "stakeholder" },
  other: { email: `riley${TEST_DOMAIN}`, name: "Riley Other", org: "other", role: "admin" },
};
export const ORG = { name: "Trackwise Demo", slug: "trackwise-demo" };
export const OTHER_ORG = { name: "Other Co", slug: "other-co" };
/** Where a signed-in person lands (TEST_HOME). */
export const HOME = "/home";
/** The active-workspace cookie (ORG_COOKIE in lib/constants.ts). */
export const ORG_COOKIE = "trackwise.org";
export const SESSION_COOKIE = "authjs.session-token";

export const firstName = (persona) => PEOPLE[persona].name.split(" ")[0];
export const orgOf = (persona) => (PEOPLE[persona].org === "demo" ? ORG : OTHER_ORG);

// --- steps -----------------------------------------------------------------------------------

const steps = [];

/** One line per assertion; the summary at the end sets the exit code. */
export function step(name, ok, detail = "") {
  steps.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return Boolean(ok);
}

export function note(text) {
  console.log(`     ${text}`);
}

export function finish() {
  const failed = steps.filter((each) => !each.ok);
  console.log(
    failed.length === 0
      ? `\nAll ${steps.length} steps passed.`
      : `\n${failed.length} of ${steps.length} steps failed: ${failed.map((each) => each.name).join("; ")}`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
  return failed.length === 0;
}

// --- browsers ----------------------------------------------------------------------------------

/** openBrowser from test-browser.mjs, pointed at BASE_URL unless told otherwise. */
export function openBrowser(options = {}) {
  return openRawBrowser({ baseUrl: BASE_URL, ...options });
}

/** A browser for the length of `run`, closed even when a step throws. */
export async function withBrowser(options, run) {
  const browser = await openBrowser(options);
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}

/** A screenshot of every browser when a flow stops half way, so the failure can be looked at. */
export async function stoppedOn(error, tag, browsers) {
  console.log(`stopped: ${error instanceof Error ? error.message : error}`);
  for (const [name, browser] of Object.entries(browsers)) {
    try {
      console.log(`     ${await browser.shot(`${tag}-stopped-${name}`, { full: true })}`);
    } catch {
      /* the browser may be gone */
    }
  }
}

/** Does the page show Next's error or not-found screen (dev overlay included), or nothing at all? */
export async function pageBroken(browser) {
  const text = ((await browser.text()) ?? "").toLowerCase();
  const overlay = await browser.evaluate(
    `(() => { const p = document.querySelector("nextjs-portal"); const t = p?.shadowRoot?.textContent ?? ""; return /unhandled|runtime error|server error|build error/i.test(t) })()`,
  );
  const notFound = text.includes("this page could not be found");
  return {
    error: overlay === true || text.includes("internal server error") || text.includes("application error") || text.includes("server-side exception"),
    notFound,
    // Next's own not-found page is only a line long; that is not a blank page.
    blank: text.trim().length < 40 && !notFound,
  };
}

// --- database and tidy-up -----------------------------------------------------------------------

let pool = null;

/** One-off reads of test data (a workspace's id, a session row). Only ever used on .test rows. */
export async function query(text, params = []) {
  if (pool === null) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return (await pool.query(text, params)).rows;
}

export async function closePool() {
  if (pool !== null) await pool.end();
  pool = null;
}

/**
 * Puts both demo workspaces back to the seeded state: `npx tsx scripts/test-accounts.ts tidy`, run through tsx's
 * own entry point so it works the same in every shell (npx needs a shell on Windows).
 */
export function tidy() {
  const run = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/test-accounts.ts", "tidy"], { stdio: "inherit" });
  if (run.status !== 0) throw new Error("tidy failed: is the database reachable?");
}
