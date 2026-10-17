import "server-only";
import type { Tx } from "@/db";
import { taskActivity } from "@/db/schema";
import type { ActivityDraft } from "@/lib/tasks/transitions";

// Writes to the append-only audit trail. Reading it back is lib/dal/history.ts (one task) and
// recentActivity in lib/dal/tasks.ts (the workspace feed).

/**
 * Appends audit rows for one task inside the caller's transaction. History is never rewritten. Rows written
 * together are a millisecond apart in the order given, so the history keeps the order they happened in
 * ("unblocked" before "approval_requested", "approved" before "completed").
 */
export async function recordActivity(
  tx: Tx,
  scope: { orgId: string; taskId: string; actorId: string },
  drafts: ActivityDraft[],
  at: Date = new Date(),
): Promise<void> {
  if (drafts.length === 0) return;
  await tx.insert(taskActivity).values(
    drafts.map((draft, index) => ({
      orgId: scope.orgId,
      taskId: scope.taskId,
      actorId: scope.actorId,
      kind: draft.kind,
      before: draft.before ?? null,
      after: draft.after ?? null,
      note: draft.note ?? null,
      createdAt: new Date(at.getTime() + index),
    })),
  );
}
