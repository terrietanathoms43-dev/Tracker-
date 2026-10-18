/**
 * One-off: copies the legacy single assignee (tasks.assignee_id) into task_assignees, for a database that had
 * tasks before assignment became a set (docs/PLAN.md, 2026-10-18 log). Idempotent: a task that already has the
 * person in task_assignees is skipped, and the legacy column is left as it is.
 *
 *   npx tsx scripts/backfill-assignees.ts          # or: npm run db:backfill-assignees
 */
import "./load-env";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main(): Promise<void> {
  const result = await db.execute<{ task_id: string }>(sql`
    insert into task_assignees (task_id, user_id, assigned_by, assigned_at)
    select t.id, t.assignee_id, t.created_by, t.created_at
    from tasks t
    where t.assignee_id is not null
    on conflict (task_id, user_id) do nothing
    returning task_id`);
  const [left] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from tasks t where t.assignee_id is not null and not exists (select 1 from task_assignees ta where ta.task_id = t.id and ta.user_id = t.assignee_id)`)).rows;
  console.log(`Copied ${result.rows.length} legacy assignee(s) into task_assignees; ${left?.n ?? 0} left uncopied.`);
}

main()
  .catch((error: unknown) => {
    console.error(`Failed, nothing was changed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
