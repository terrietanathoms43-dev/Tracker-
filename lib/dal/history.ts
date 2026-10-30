import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { taskUpdates } from "@/db/schema";
import type { Viewer } from "@/lib/permissions";
import { phraseHistory, type HistoryRow } from "@/lib/tasks/history";
import type { HistoryPage } from "@/lib/tasks/types";

// A task's comments and history, merged into one timeline for the bottom of the task page.

export const HISTORY_PAGE = 20;

/**
 * Progress updates, comments and audit events of one task, newest first, 20 at a time. The `progress_updated`,
 * `commented`, `comment_resolved` and `comment_reopened` audit rows are left out because the update or the comment
 * itself (with its resolved state) is shown. The cursor is the id of the last entry shown; callers must already
 * know the viewer may read the task.
 */
export async function listHistory(viewer: Viewer, taskId: string, cursor: string | null, now: Date = new Date()): Promise<HistoryPage> {
  const after = cursor
    ? sql`and (h.created_at, h.id) < (coalesce((select created_at from task_updates where id = ${cursor}), (select created_at from task_activity where id = ${cursor})), ${cursor})`
    : sql``;
  const result = await db.execute<HistoryRow>(sql`
    select h.type, h.id, h.created_at, h.kind, h.body, h.next_action, h.blocker, h.before, h.after, h.note, h.resolved_at,
           actor.id as actor_id, actor.name as actor_name, actor.email as actor_email, actor.image as actor_image,
           before_user.name as before_assignee, after_user.name as after_assignee, approver.name as approver_name,
           resolver.name as resolved_by_name
    from (
      select u.kind::text as type, u.id, u.created_at, u.author_id as actor_id, null::text as kind, u.body, u.next_action, u.blocker,
             null::jsonb as before, null::jsonb as after, null::text as note, u.resolved_at, u.resolved_by
      from task_updates u join tasks t on t.id = u.task_id
      where u.task_id = ${taskId} and t.org_id = ${viewer.orgId}
      union all
      select 'activity', a.id, a.created_at, a.actor_id, a.kind::text, null, null, null, a.before, a.after, a.note, null::timestamptz, null::text
      from task_activity a
      where a.task_id = ${taskId} and a.org_id = ${viewer.orgId}
        and a.kind not in ('progress_updated', 'commented', 'comment_resolved', 'comment_reopened')
    ) h
    join users actor on actor.id = h.actor_id
    left join users before_user on before_user.id = h.before->>'assigneeId'
    left join users after_user on after_user.id = h.after->>'assigneeId'
    left join users approver on approver.id = h.after->>'approverId'
    left join users resolver on resolver.id = h.resolved_by
    where true ${after}
    order by h.created_at desc, h.id desc
    limit ${HISTORY_PAGE + 1}`);
  const rows = result.rows;
  const items = rows.slice(0, HISTORY_PAGE).map((row) => phraseHistory(row, viewer.timezone, now));
  return { items, nextCursor: rows.length > HISTORY_PAGE ? items[items.length - 1].id : null };
}

/** One comment of a task, locked for the rest of the transaction (null when it isn't a comment of that task). */
export async function lockComment(tx: Tx, taskId: string, commentId: string) {
  const [row] = await tx
    .select({ id: taskUpdates.id, resolvedAt: taskUpdates.resolvedAt })
    .from(taskUpdates)
    .where(and(eq(taskUpdates.id, commentId), eq(taskUpdates.taskId, taskId), eq(taskUpdates.kind, "comment")))
    .for("update");
  return row ?? null;
}

/** How many of a task's comments are still open. */
export async function openCommentCount(handle: Tx | typeof db, taskId: string): Promise<number> {
  const [row] = await handle
    .select({ n: sql<number>`count(*)::int` })
    .from(taskUpdates)
    .where(and(eq(taskUpdates.taskId, taskId), eq(taskUpdates.kind, "comment"), isNull(taskUpdates.resolvedAt)));
  return row?.n ?? 0;
}
