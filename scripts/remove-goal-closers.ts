/**
 * Removes the "Everything completed" tasks (2026-11-04 log) that stood for a goal being achieved: since 2026-11-07
 * a goal is achieved by its last task directly (lib/dal/goal-achievement.ts), so the closer rows are noise.
 *
 *   npm run db:remove-closers              delete every task with goal_closer = true in DATABASE_URL
 *   npm run db:remove-closers -- --dry-run count them and touch nothing
 *
 * One transaction; assignees, updates, links and history cascade with the task. Run it on each database after
 * `npm run db:push` for the 2026-11-07 release (docs/RUNBOOK.md). Reads DATABASE_URL from .env.local like the app.
 */
import "./load-env";
import { Client } from "pg";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ org: string; n: string; open: string }>(
      `select o.name as org, count(*)::text as n, count(*) filter (where t.status not in ('completed', 'rejected', 'deferred', 'cancelled'))::text as open
         from tasks t join organizations o on o.id = t.org_id
        where t.goal_closer
        group by o.name order by o.name`,
    );
    if (rows.length === 0) {
      console.log("remove-goal-closers: no closer tasks found");
      await client.query("rollback");
      return;
    }
    for (const row of rows) console.log(`remove-goal-closers: ${row.org}: ${row.n} closer tasks (${row.open} still open)`);
    if (dryRun) {
      console.log("remove-goal-closers: dry run, nothing deleted");
      await client.query("rollback");
      return;
    }
    const deleted = await client.query("delete from tasks where goal_closer");
    await client.query("commit");
    console.log(`remove-goal-closers: deleted ${deleted.rowCount ?? 0} closer tasks`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("remove-goal-closers:", error instanceof Error ? error.message : error);
  process.exit(1);
});
