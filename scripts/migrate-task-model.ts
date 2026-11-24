/**
 * Moves existing rows onto the task model (docs/PLAN.md, 2026-11-24 log; docs/RUNBOOK.md, "The 2026-11-24 release").
 * Two steps, one transaction, each idempotent:
 *
 *   1. Deferred is no longer a status. Every task still `deferred` is open again: In progress when it had been
 *      started, otherwise Not started, with a history line that keeps the reason it was deferred with. A goal that
 *      was marked achieved while such a task sat deferred under it has open work again, so it is active again and
 *      its "Everything completed" task is open again, exactly as when a task under an achieved goal is reopened in
 *      the app. (A deferral is now a due date moved later, asked for on the task's page.)
 *   2. The closure snapshot. Every closed task (completed, merged, rejected, cancelled) that has none gets
 *      `closed_at` (its completion time, else the history row that closed it) and `due_date_at_close` (the due date
 *      it had then: the date before the first due-date change made after it closed, else the date it has now).
 *      Needs the two columns, so `npm run db:push` first; without them this step says so and is skipped.
 *
 *   npm run db:migrate-task-model              apply both steps to DATABASE_URL
 *   npm run db:migrate-task-model -- --dry-run run every statement, say what each step touched, then roll it all back
 *
 * Safe to run before the new code is deployed: the old code reads a reopened task like any other and ignores the
 * two columns. Take `npm run db:backup` first on a database with real data. Reads DATABASE_URL from .env.local.
 */
import "./load-env";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const dryRun = process.argv.includes("--dry-run");
const log = (line: string) => console.log(`migrate-task-model: ${line}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Deferred = { id: string; org_id: string; org: string; title: string; started_at: Date | null; rejection_reason: string | null; goal_id: string | null; goal_title: string | null; goal_status: string | null; actor_id: string };

const CLOSED = "('completed', 'rejected', 'cancelled', 'merged')";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    const now = new Date();
    // The snapshot columns arrive with `db:push`: step 1 clears them where they exist, step 2 needs them.
    const { rows: columns } = await client.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name in ('closed_at', 'due_date_at_close')`);
    const hasSnapshot = columns.length === 2;
    const clearSnapshot = hasSnapshot ? ", closed_at = null, due_date_at_close = null" : "";

    // --- 1. deferred tasks are open again ---------------------------------------------------------------------------
    const { rows: deferred } = await client.query<Deferred>(
      `select t.id, t.org_id, o.name as org, t.title, t.started_at, t.rejection_reason, t.goal_id, g.title as goal_title, g.status::text as goal_status,
              coalesce((select a.actor_id from task_activity a where a.task_id = t.id and a.kind = 'deferred' order by a.created_at desc limit 1), t.created_by) as actor_id
         from tasks t join organizations o on o.id = t.org_id left join goals g on g.id = t.goal_id
        where t.status::text = 'deferred'
        order by o.name, t.created_at`,
    );
    if (deferred.length === 0) log("step 1: no task is deferred, nothing to reopen");
    const reopenedGoals = new Map<string, { title: string; orgId: string; actorId: string }>();
    for (const task of deferred) {
      const to = task.started_at ? "in_progress" : "not_started";
      const live = task.goal_id !== null && task.goal_status === "completed";
      log(`step 1: ${task.org}: “${task.title}” → ${to === "in_progress" ? "In progress" : "Not started"}${live ? ` (its goal “${task.goal_title}” is achieved: active again)` : ""}`);
      if (live && task.goal_id !== null) reopenedGoals.set(task.goal_id, { title: task.goal_title ?? "", orgId: task.org_id, actorId: task.actor_id });
      await client.query(`update tasks set status = $2, rejection_reason = null${clearSnapshot}, updated_at = $3 where id = $1`, [task.id, to, now]);
      await client.query(`insert into task_activity (id, org_id, task_id, actor_id, kind, "before", "after", note, created_at) values ($1, $2, $3, $4, 'reopened', $5, $6, $7, $8)`, [
        randomUUID(),
        task.org_id,
        task.id,
        task.actor_id,
        JSON.stringify({ status: "deferred" }),
        JSON.stringify({ status: to }),
        `Deferred is no longer a status: a deferral is now a due date moved later. Open again.${task.rejection_reason ? ` It had been deferred with: “${task.rejection_reason}”.` : ""}`,
        now,
      ]);
    }
    // An achieved goal with open work under it is active again, and its last step is open again (lib/dal/goal-achievement.ts).
    for (const [goalId, goal] of reopenedGoals) {
      await client.query(`update goals set status = 'active', completed_at = null, completed_by = null, updated_at = $2 where id = $1 and status = 'completed'`, [goalId, now]);
      const { rows: closers } = await client.query<{ id: string }>(
        `update tasks set status = 'not_started', completed_at = null, completion_summary = null${clearSnapshot}, updated_at = $2
          where goal_id = $1 and goal_closer and status = 'completed' returning id`,
        [goalId, now],
      );
      for (const closer of closers) {
        await client.query(`insert into task_activity (id, org_id, task_id, actor_id, kind, "before", "after", note, created_at) values ($1, $2, $3, $4, 'reopened', $5, $6, $7, $8)`, [
          randomUUID(),
          goal.orgId,
          closer.id,
          goal.actorId,
          JSON.stringify({ status: "completed" }),
          JSON.stringify({ status: "not_started" }),
          `Open again with its goal: “${goal.title}” is active again (a task deferred under it is open again).`,
          now,
        ]);
      }
    }
    if (deferred.length > 0) log(`step 1: ${plural(deferred.length, "deferred task")} open again${reopenedGoals.size > 0 ? `; ${plural(reopenedGoals.size, "achieved goal")} active again` : ""}`);

    // --- 2. the closure snapshot ------------------------------------------------------------------------------------
    if (!hasSnapshot) {
      log("step 2: skipped. tasks.closed_at / tasks.due_date_at_close do not exist yet: run `npm run db:push`, then this script again");
    } else {
      const { rows: missing } = await client.query<{ org: string; n: number }>(
        `select o.name as org, count(*)::int as n from tasks t join organizations o on o.id = t.org_id where t.status::text in ${CLOSED} and t.closed_at is null group by o.name order by o.name`,
      );
      if (missing.length === 0) log("step 2: every closed task already has its closure snapshot");
      for (const row of missing) log(`step 2: ${row.org}: ${plural(row.n, "closed task")} without a closure snapshot`);
      if (missing.length > 0) {
        // The closing instant, then the due date in force at that instant: the "before" of the first due-date change
        // made after it (a row whose before holds no date means it was closed without one), else today's date.
        const result = await client.query(
          `with closed as (
             select t.id,
                    coalesce(t.completed_at, (select max(a.created_at) from task_activity a where a.task_id = t.id and a.after->>'status' = t.status::text), t.updated_at) as at
               from tasks t
              where t.status::text in ${CLOSED} and t.closed_at is null
           )
           update tasks t
              set closed_at = closed.at,
                  due_date_at_close = case
                    when exists (select 1 from task_activity a where a.task_id = t.id and a.kind = 'due_changed' and a.created_at > closed.at)
                      then (select nullif(a.before->>'dueDate', '')::date from task_activity a where a.task_id = t.id and a.kind = 'due_changed' and a.created_at > closed.at order by a.created_at asc limit 1)
                    else t.due_date end
             from closed
            where closed.id = t.id`,
        );
        log(`step 2: closure snapshot written on ${plural(result.rowCount ?? 0, "task")}`);
      }
    }

    if (dryRun) {
      log("dry run: rolled back, nothing changed");
      await client.query("rollback");
    } else {
      await client.query("commit");
      log("done");
    }
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`migrate-task-model: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
