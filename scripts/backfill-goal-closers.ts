/**
 * Gives every active goal that lacks one its "Everything completed" task (docs/PLAN.md, 2026-11-04 log), assigned
 * to the goal's owner when they work in the workspace. Idempotent: a goal that already has a closer is skipped.
 *
 *   npm run db:backfill-closers
 *
 * Reads DATABASE_URL from .env.local like the app. Run once after `npm run db:push` adds the goal_closer column.
 */
import "./load-env";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const TITLE = "Everything completed";
const DESCRIPTION = "Complete this last, once every other task under the goal is done: it marks the goal achieved.";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: missing } = await client.query<{ id: string; org_id: string; project_id: string; owner_id: string | null; target_date: string | null; created_by: string; title: string }>(
      `select g.id, g.org_id, g.project_id, g.owner_id, g.target_date::text as target_date, g.created_by, g.title
         from goals g
        where g.status = 'active'
          and not exists (select 1 from tasks t where t.goal_id = g.id and t.goal_closer)
        order by g.created_at`,
    );
    let assigned = 0;
    for (const goal of missing) {
      const taskId = randomUUID();
      await client.query(
        `insert into tasks (id, org_id, project_id, goal_id, title, description, created_by, due_date, goal_closer)
         values ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [taskId, goal.org_id, goal.project_id, goal.id, TITLE, DESCRIPTION, goal.created_by, goal.target_date],
      );
      await client.query(`insert into task_activity (id, org_id, task_id, actor_id, kind, "after", note) values ($1, $2, $3, $4, 'created', $5, $6)`, [
        randomUUID(),
        goal.org_id,
        taskId,
        goal.created_by,
        JSON.stringify({ title: TITLE, goalCloser: true }),
        "Made for the goal: completing it marks the goal achieved.",
      ]);
      if (goal.owner_id) {
        const { rows: owner } = await client.query(`select 1 from organization_members where org_id = $1 and user_id = $2 and role <> 'stakeholder'`, [goal.org_id, goal.owner_id]);
        if (owner.length > 0) {
          await client.query(`insert into task_assignees (task_id, user_id, assigned_by) values ($1, $2, $3) on conflict do nothing`, [taskId, goal.owner_id, goal.created_by]);
          assigned += 1;
        }
      }
    }
    await client.query("commit");
    console.log(`Closers added: ${missing.length} (${assigned} assigned to their goal's owner).`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
