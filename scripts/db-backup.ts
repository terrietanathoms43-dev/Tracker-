/**
 * Dumps every table of the database to JSON files under backups/<timestamp>/ (git-ignored) and prints row counts,
 * so a schema change can always be undone by hand from what was there.
 *
 *   npm run db:backup            → backups/2026-11-03T15-04-05/<table>.json
 *
 * Reads DATABASE_URL from .env.local like the app. Nothing is written to the database.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join("backups", stamp);
  mkdirSync(dir, { recursive: true });
  const tables = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
  );
  const counts: Record<string, number> = {};
  for (const { table_name } of tables.rows) {
    const rows = await pool.query(`select * from "${table_name}"`);
    counts[table_name] = rows.rowCount ?? rows.rows.length;
    writeFileSync(path.join(dir, `${table_name}.json`), JSON.stringify(rows.rows, null, 2));
  }
  console.table(counts);
  const realUsers = await pool.query<{ n: number }>("select count(*)::int as n from users where email not like '%@trackwise.test'");
  const orgs = await pool.query<{ name: string; slug: string; members: number }>(
    "select o.name, o.slug, (select count(*)::int from organization_members m where m.org_id = o.id) as members from organizations o order by o.created_at",
  );
  console.log(`non-test users: ${realUsers.rows[0]?.n ?? 0}`);
  console.table(orgs.rows);
  console.log(`wrote ${tables.rows.length} tables to ${dir}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
