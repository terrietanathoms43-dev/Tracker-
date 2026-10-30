/**
 * One-off: when teams left the product (docs/PLAN.md, 2026-10-30 log), work that was assigned to a team would have
 * had nobody on it. This copies every member of each team onto the team's tasks as a direct assignee, so the same
 * people still see and own that work. Idempotent: a person already on a task is skipped, and the legacy team tables
 * are left as they are. People who have since left the workspace (or became stakeholders) are not added.
 *
 *   npx tsx scripts/backfill-team-assignees.ts          # or: npm run db:backfill-team-assignees
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
    select distinct tt.task_id, tm.user_id, tt.assigned_by, tt.assigned_at
    from task_teams tt
    join team_members tm on tm.team_id = tt.team_id
    join tasks t on t.id = tt.task_id
    join organization_members om on om.org_id = t.org_id and om.user_id = tm.user_id and om.role <> 'stakeholder'
    on conflict (task_id, user_id) do nothing
    returning task_id`);
  const [left] = (
    await db.execute<{ n: number }>(sql`
      select count(*)::int as n from task_teams tt
      where not exists (select 1 from task_assignees ta where ta.task_id = tt.task_id)`)
  ).rows;
  console.log(`Added ${result.rows.length} direct assignment(s) from team memberships; ${left?.n ?? 0} team-assigned task(s) still have nobody on them (their team had no current members).`);
}

main()
  .catch((error: unknown) => {
    console.error(`Failed, nothing was changed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
