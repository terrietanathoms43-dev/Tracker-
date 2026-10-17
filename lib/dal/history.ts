import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Viewer } from "@/lib/permissions";
import { phraseHistory, type HistoryRow } from "@/lib/tasks/history";
import type { HistoryPage } from "@/lib/tasks/types";

// A task's comments and history, merged into one timeline for the bottom of the task page.

export const HISTORY_PAGE = 20;

/**
 * Progress updates, comments and audit events of one task, newest first, 20 at a time. The `progress_updated`
 * and `commented` audit rows are left out because the update or comment itself is shown. The cursor is the id of
 * the last entry shown; callers must already know the viewer may read the task.
 */
export async function listHistory(viewer: Viewer, taskId: string, cursor: string | null, now: Date = new Date()): Promise<HistoryPage> {
  const after = cursor
    ? sql`and (h.created_at, h.id) < (coalesce((select created_at from task_updates where id = ${cursor}), (select created_at from task_activity where id = ${cursor})), ${cursor})`
    : sql``;
  const result = await db.execute<HistoryRow>(sql`
    select h.type, h.id, h.created_at, h.kind, h.body, h.next_action, h.blocker, h.before, h.after, h.note,
           actor.id as actor_id, actor.name as actor_name, actor.email as actor_email, actor.image as actor_image,
           before_user.name as before_assignee, after_user.name as after_assignee, approver.name as approver_name
    from (
      select u.kind::text as type, u.id, u.created_at, u.author_id as actor_id, null::text as kind, u.body, u.next_action, u.blocker,
             null::jsonb as before, null::jsonb as after, null::text as note
      from task_updates u join tasks t on t.id = u.task_id
      where u.task_id = ${taskId} and t.org_id = ${viewer.orgId}
      union all
      select 'activity', a.id, a.created_at, a.actor_id, a.kind::text, null, null, null, a.before, a.after, a.note
      from task_activity a
      where a.task_id = ${taskId} and a.org_id = ${viewer.orgId} and a.kind not in ('progress_updated', 'commented')
    ) h
    join users actor on actor.id = h.actor_id
    left join users before_user on before_user.id = h.before->>'assigneeId'
    left join users after_user on after_user.id = h.after->>'assigneeId'
    left join users approver on approver.id = h.after->>'approverId'
    where true ${after}
    order by h.created_at desc, h.id desc
    limit ${HISTORY_PAGE + 1}`);
  const rows = result.rows;
  const items = rows.slice(0, HISTORY_PAGE).map((row) => phraseHistory(row, viewer.timezone, now));
  return { items, nextCursor: rows.length > HISTORY_PAGE ? items[items.length - 1].id : null };
}
