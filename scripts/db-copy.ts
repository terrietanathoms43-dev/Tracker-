/**
 * Copies one database into another, schema and rows exactly as they are, with pg_dump and pg_restore
 * (docs/RUNBOOK.md, "Dev, staging and production"). Data only travels downwards: production is never a target.
 *
 *   npm run db:copy -- --from=prod --to=dev              PROD_DATABASE_URL → DEV_DATABASE_URL
 *   npm run db:copy -- --to=dev                          this checkout's DATABASE_URL → DEV_DATABASE_URL
 *   npm run db:copy -- --from=prod --to=local --replace  PROD_DATABASE_URL → this checkout's DATABASE_URL
 *   npm run db:copy -- --from=prod --dump-only           just the dump, as a restorable backup
 *   npm run db:copy -- --from=prod --to=dev --dry-run    print the plan and the row counts, touch nothing
 *
 * A name stands for <NAME>_DATABASE_URL in .env.local (`local` is DATABASE_URL itself); a postgres:// URL is taken
 * as given. The _DIRECT variant is used when set, because Neon's pooler cannot serve a dump. The dump is written to
 * backups/<stamp>-<name>.dump (custom format, git-ignored) and restored in one transaction that first drops every
 * object the dump knows about, so a target that already has tables must be named with --replace; a target whose
 * restore fails is left as it was. Afterwards every table's row count is compared between the two databases.
 *
 * Only the `public` schema travels: that is the whole app (db/schema.ts). Neon keeps its own `neon_auth` schema next
 * to it, which stays behind, and the `public` schema itself is never dropped or recreated in the target (its TOC entry
 * is left out of the restore), so the target role's rights on it survive. Extensions are not part of a schema and are
 * not copied; the app uses none beyond plpgsql.
 *
 * pg_dump and pg_restore come from PG_BIN, then PATH, then pgAdmin's runtime folder. Their major version must be at
 * least the source server's (a newer tool dumps an older server; the other way round pg_dump refuses itself).
 * Passwords never appear on a command line: the tools get them through PGPASSWORD.
 */
import "./load-env";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

type Endpoint = {
  /** What the person typed: a name such as `prod`, or `url` for a raw URL. */
  name: string;
  /** The URL the tools and the checks use (the _DIRECT one when set). */
  url: string;
  /** host/database, for messages. Never the user or the password. */
  label: string;
  /** host:port/database with Neon's `-pooler` stripped, so two URLs of one database compare equal. */
  id: string;
};

type Inspection = { version: string; major: number; counts: Record<string, number> };

const USAGE = `usage: npm run db:copy -- [--from=<name|url>] (--to=<name|url> | --dump-only) [--replace] [--dry-run]
  --from       source: a name (<NAME>_DATABASE_URL in .env.local), "local" (DATABASE_URL) or a postgres:// URL. Default: local.
  --to         target, the same way. Production ("prod", "production", or whatever PROD_DATABASE_URL names) is refused.
  --replace    allow a target that already has tables: everything the dump knows about is dropped and recreated.
  --dump-only  write backups/<stamp>-<name>.dump from the source and stop.
  --dry-run    show both ends, the tools and the row counts; change nothing.`;

function fail(message: string): never {
  console.error(`db:copy: ${message}`);
  process.exit(1);
}

// --- arguments -----------------------------------------------------------------------------------------------

const args = new Map<string, string>();
for (const raw of process.argv.slice(2)) {
  if (!raw.startsWith("--")) fail(`unexpected argument ${raw}\n${USAGE}`);
  const eq = raw.indexOf("=");
  if (eq === -1) args.set(raw.slice(2), "true");
  else args.set(raw.slice(2, eq), raw.slice(eq + 1));
}
if (args.has("help")) {
  console.log(USAGE);
  process.exit(0);
}
const fromSpec = args.get("from") ?? "local";
const toSpec = args.get("to");
const replace = args.get("replace") === "true";
const dryRun = args.get("dry-run") === "true";
const dumpOnly = args.get("dump-only") === "true";
if (!toSpec && !dumpOnly) fail(`--to is required (or --dump-only)\n${USAGE}`);

// --- which databases -----------------------------------------------------------------------------------------

function envKey(name: string): string {
  return name === "local" ? "" : `${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_`;
}

function endpoint(name: string, url: string): Endpoint {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail(`${name}: not a postgres:// URL`);
  }
  const host = parsed.hostname.replace(/-pooler(?=\.)/, "");
  const db = decodeURIComponent(parsed.pathname.slice(1));
  if (!db) fail(`${name}: the URL names no database`);
  return { name, url, label: `${host}/${db}`, id: `${host}:${parsed.port || "5432"}/${db}` };
}

function resolve(spec: string): Endpoint {
  if (/^postgres(ql)?:\/\//i.test(spec)) return endpoint("url", spec);
  const key = envKey(spec);
  const url = process.env[`${key}DATABASE_URL_DIRECT`] || process.env[`${key}DATABASE_URL`];
  if (!url) fail(`${spec}: set ${key}DATABASE_URL in .env.local (and ${key}DATABASE_URL_DIRECT when it is a Neon database)`);
  return endpoint(spec, url);
}

const from = resolve(fromSpec);
const to = toSpec ? resolve(toSpec) : null;

if (to) {
  if (/^prod(uction)?$/i.test(to.name)) fail("production is never a target; data only ever flows from production");
  for (const key of ["PROD_", "PRODUCTION_"]) {
    const url = process.env[`${key}DATABASE_URL_DIRECT`] || process.env[`${key}DATABASE_URL`];
    if (url && endpoint(key, url).id === to.id) fail(`the target is the production database (${key}DATABASE_URL); refused`);
  }
  if (to.id === from.id) fail(`source and target are the same database (${to.label})`);
}

// --- the tools -----------------------------------------------------------------------------------------------

function findTool(tool: "pg_dump" | "pg_restore"): string {
  const exe = process.platform === "win32" ? `${tool}.exe` : tool;
  const dirs = [
    process.env.PG_BIN,
    ...(process.env.PATH ?? "").split(path.delimiter),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "pgAdmin 4", "runtime") : undefined,
    "C:\\Program Files\\pgAdmin 4\\runtime",
    "/Applications/pgAdmin 4.app/Contents/SharedSupport",
    "/usr/lib/postgresql/17/bin",
    "/usr/lib/postgresql/16/bin",
  ].filter((d): d is string => Boolean(d));
  for (const dir of dirs) {
    const candidate = path.join(dir, exe);
    if (existsSync(candidate)) return candidate;
  }
  return fail(`${tool} not found: install the PostgreSQL client tools, or set PG_BIN to a folder that has them (pgAdmin ships them in its runtime folder)`);
}

function toolMajor(bin: string): number {
  const result = spawnSync(bin, ["--version"], { encoding: "utf8" });
  const match = /\(PostgreSQL\) (\d+)/.exec(result.stdout ?? "");
  if (result.status !== 0 || !match) fail(`${bin} did not report a version`);
  return Number(match[1]);
}

/** libpq connection arguments for an endpoint; the password goes through the environment, never the command line. */
function connection(end: Endpoint): { args: string[]; env: NodeJS.ProcessEnv } {
  const parsed = new URL(end.url);
  const env: NodeJS.ProcessEnv = { ...process.env, PGCONNECT_TIMEOUT: "20" };
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  const channelBinding = parsed.searchParams.get("channel_binding");
  if (channelBinding) env.PGCHANNELBINDING = channelBinding;
  const cliArgs = [`--host=${parsed.hostname}`, `--port=${parsed.port || "5432"}`, `--dbname=${decodeURIComponent(parsed.pathname.slice(1))}`, "--no-password"];
  if (parsed.username) cliArgs.push(`--username=${decodeURIComponent(parsed.username)}`);
  return { args: cliArgs, env };
}

function run(bin: string, cliArgs: string[], env: NodeJS.ProcessEnv, what: string) {
  const result = spawnSync(bin, cliArgs, { stdio: "inherit", env });
  if (result.error) fail(`${what}: ${result.error.message}`);
  if (result.status !== 0) {
    fail(
      `${what} failed (exit ${result.status})${
        what === "pg_restore"
          ? "; the single transaction rolled back, so the target is as it was. If the error names an object other things depend on, the target has tables or types the dump does not know: drop them (or drop and recreate its public schema) and run again"
          : ""
      }`,
    );
  }
}

/**
 * The archive's table of contents without the `public` schema itself (and its comment): restoring those would drop
 * and recreate the schema in the target, taking every grant on it along. Everything else is kept in archive order.
 */
function restoreList(pgRestore: string, dump: string): string {
  const listed = spawnSync(pgRestore, ["--list", dump], { encoding: "utf8" });
  if (listed.status !== 0 || !listed.stdout) fail(`pg_restore --list failed: ${listed.stderr || "no output"}`);
  const kept = listed.stdout.split(/\r?\n/).filter((line) => !/^\d+; \d+ \d+ (SCHEMA - public|COMMENT - SCHEMA public)\b/.test(line));
  const file = dump.replace(/\.dump$/, ".list");
  writeFileSync(file, kept.join("\n"));
  return file;
}

// --- looking at a database -----------------------------------------------------------------------------------

async function inspect(end: Endpoint): Promise<Inspection> {
  const client = new Client({ connectionString: end.url, connectionTimeoutMillis: 20_000, statement_timeout: 60_000 });
  try {
    await client.connect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = /does not exist/.test(message) ? " (create the empty database first: pgAdmin → Databases → Create, or `create database …`)" : "";
    return fail(`cannot connect to ${end.name} (${end.label}): ${message}${hint}`);
  }
  try {
    const version = await client.query<{ v: string; n: string }>("select current_setting('server_version') as v, current_setting('server_version_num') as n");
    const tables = await client.query<{ t: string }>(
      "select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
    );
    const counts: Record<string, number> = {};
    for (const { t } of tables.rows) {
      const count = await client.query<{ n: number }>(`select count(*)::int as n from "${t.replace(/"/g, '""')}"`);
      counts[t] = count.rows[0]?.n ?? 0;
    }
    return { version: version.rows[0]?.v ?? "?", major: Math.floor(Number(version.rows[0]?.n ?? 0) / 10000), counts };
  } finally {
    await client.end();
  }
}

const total = (counts: Record<string, number>) => Object.values(counts).reduce((sum, n) => sum + n, 0);

// --- main ------------------------------------------------------------------------------------------------------

async function main() {
  const pgDump = findTool("pg_dump");
  const pgRestore = findTool("pg_restore");
  const dumpMajor = toolMajor(pgDump);
  const restoreMajor = toolMajor(pgRestore);

  const source = await inspect(from);
  console.log(`source  ${from.name}: ${from.label} (PostgreSQL ${source.version}), ${Object.keys(source.counts).length} tables, ${total(source.counts)} rows`);
  if (dumpMajor < source.major) fail(`pg_dump ${dumpMajor} is older than the source server (${source.major}); point PG_BIN at PostgreSQL ${source.major} client tools`);

  let target: Inspection | null = null;
  if (to) {
    target = await inspect(to);
    const tableCount = Object.keys(target.counts).length;
    console.log(`target  ${to.name}: ${to.label} (PostgreSQL ${target.version}), ${tableCount} tables, ${total(target.counts)} rows`);
    if (tableCount > 0 && !replace) fail(`${to.name} already has tables; add --replace to drop and recreate what the dump contains`);
    if (restoreMajor < source.major) fail(`pg_restore ${restoreMajor} is older than the source server (${source.major})`);
  }
  console.log(`tools   pg_dump ${dumpMajor}, pg_restore ${restoreMajor} (${path.dirname(pgDump)})`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join("backups", `${stamp}-${from.name.replace(/[^a-z0-9]+/gi, "-")}.dump`);
  console.log(`dump    ${file}`);
  console.table(
    Object.fromEntries(
      Object.entries(source.counts).map(([table, n]) => [table, target ? { source: n, target: target.counts[table] ?? "—" } : { source: n }]),
    ),
  );

  if (dryRun) {
    console.log(to ? `dry run: nothing changed. Without --dry-run, ${to.label} becomes a copy of ${from.label}.` : "dry run: nothing changed.");
    return;
  }

  mkdirSync("backups", { recursive: true });
  const dump = connection(from);
  run(pgDump, ["--format=custom", "--schema=public", "--no-owner", "--no-privileges", `--file=${file}`, ...dump.args], dump.env, "pg_dump");
  console.log(`dumped  ${file} (${(statSync(file).size / 1024).toFixed(0)} KB)`);
  if (!to) return;

  const list = restoreList(pgRestore, file);
  const restore = connection(to);
  run(
    pgRestore,
    [
      "--single-transaction",
      "--exit-on-error",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--no-comments",
      `--use-list=${list}`,
      ...restore.args,
      file,
    ],
    restore.env,
    "pg_restore",
  );

  const after = await inspect(to);
  const rows: Record<string, { source: number; target: number | string; ok: string }> = {};
  let mismatches = 0;
  for (const [table, n] of Object.entries(source.counts)) {
    const got = after.counts[table];
    const ok = got === n;
    if (!ok) mismatches += 1;
    rows[table] = { source: n, target: got ?? "missing", ok: ok ? "yes" : "NO" };
  }
  console.table(rows);
  if (mismatches > 0) fail(`${mismatches} table(s) differ after the restore`);
  console.log(`done    ${to.label} is a copy of ${from.label} (${total(after.counts)} rows in ${Object.keys(after.counts).length} tables); dump kept at ${file}`);
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
