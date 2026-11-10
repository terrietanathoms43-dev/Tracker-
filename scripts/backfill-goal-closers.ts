/**
 * Gives every goal that is not completed and has none its "Everything completed" task (docs/PLAN.md, 2026-11-04 and
 * 2026-11-09 logs): the goal's last step, due on its target, assigned to the goal's owner when they work in the
 * workspace. Needed on a database where the closers were removed (`db:remove-closers`, 2026-11-07) or where goals
 * were made while they were switched off. A completed goal is left alone: it gets its closer if it is reopened.
 *
 *   npm run db:backfill-closers              add the missing closers in DATABASE_URL
 *   npm run db:backfill-closers -- --dry-run count them per workspace and touch nothing
 *
 * One transaction, idempotent: a goal that already has a closer is skipped, so running it twice adds nothing.
 * Undo: `delete from tasks where goal_closer`. Reads DATABASE_URL from .env.local like the app.
 */
import "./load-env";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { CLOSER_DESCRIPTION, CLOSER_TITLE } from "@/lib/tasks/closer";

const dryRun = process.argv.includes("--dry-run");

type Missing = { id: string; org_id: string; org: string; project_id: string; owner_id: string | null; target_date: string | null; created_by: string };

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    const { rows: missing } = await client.query<Missing>(
      `select g.id, g.org_id, o.name as org, g.project_id, g.owner_id, g.target_date::text as target_date, g.created_by
         from goals g join organizations o on o.id = g.org_id
        where g.status <> 'completed'
          and not exists (select 1 from tasks t where t.goal_id = g.id and t.goal_closer)
        order by o.name, g.created_at`,
    );
    if (missing.length === 0) {
      console.log("backfill-goal-closers: every open goal already has its closer");
      await client.query("rollback");
      return;
    }
    const perOrg = new Map<string, number>();
    for (const goal of missing) perOrg.set(goal.org, (perOrg.get(goal.org) ?? 0) + 1);
    for (const [org, n] of perOrg) console.log(`backfill-goal-closers: ${org}: ${n} ${n === 1 ? "goal" : "goals"} without a closer`);
    if (dryRun) {
      console.log("backfill-goal-closers: dry run, nothing added");
      await client.query("rollback");
      return;
    }
    let assigned = 0;
    for (const goal of missing) {
      const taskId = randomUUID();
      await client.query(
        `insert into tasks (id, org_id, project_id, goal_id, title, description, created_by, due_date, goal_closer)
         values ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [taskId, goal.org_id, goal.project_id, goal.id, CLOSER_TITLE, CLOSER_DESCRIPTION, goal.created_by, goal.target_date],
      );
      await client.query(`insert into task_activity (id, org_id, task_id, actor_id, kind, "after", note) values ($1, $2, $3, $4, 'created', $5, $6)`, [
        randomUUID(),
        goal.org_id,
        taskId,
        goal.created_by,
        JSON.stringify({ title: CLOSER_TITLE, goalCloser: true }),
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
    console.log(`backfill-goal-closers: added ${missing.length} closer tasks (${assigned} assigned to their goal's owner)`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("backfill-goal-closers:", error instanceof Error ? error.message : error);
  process.exit(1);
});
