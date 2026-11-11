import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { draftNotes, drafts, tasks } from "@/db/schema";
import { taskLabelSql } from "@/lib/dal/tasks";
import { DRAFT_EXCERPT_LENGTH, draftExcerpt, type DraftNote, type DraftSummary, type DraftTask, type TaskDraft } from "@/lib/drafts";
import { LIMITS } from "@/lib/limits";
import type { Viewer } from "@/lib/permissions";

// A person's drafts in a workspace (docs/PLAN.md, 2026-11-04 and 2026-11-11 logs): a list of titled notes, any of
// which may be attached to one task. Every read and write here is scoped to the viewer's own rows in the active
// workspace: a draft is never anyone else's to see, attached or not. The browser autosaves the one being typed;
// the Draft tab, the floating notepad and the task page's "Your drafts" all read the same rows.

type Handle = Tx | typeof db;

/** How much of an attached draft the task page carries; the Draft tab has the rest. */
export const TASK_DRAFT_PREVIEW = 4_000;

const own = (viewer: Viewer) => and(eq(draftNotes.userId, viewer.userId), eq(draftNotes.orgId, viewer.orgId));

/**
 * The task a draft is attached to, joined only while its author may still read it (lib/permissions.ts canReadTask):
 * in this workspace, and not somebody else's local task (a live task moved under sign-off becomes its maker's
 * local task again, 2026-11-07 log). A draft whose task is out of sight reads as unattached until it is back.
 */
const readableTask = (viewer: Viewer) =>
  and(eq(tasks.id, draftNotes.taskId), eq(tasks.orgId, viewer.orgId), sql`(${tasks.proposalStatus} is distinct from 'local' or ${tasks.createdBy} = ${viewer.userId})`);

const summaryColumns = {
  id: draftNotes.id,
  title: draftNotes.title,
  // Twice the excerpt's length, so trimming what leads the text still leaves a full excerpt.
  head: sql<string>`left(${draftNotes.body}, ${DRAFT_EXCERPT_LENGTH * 2})`,
  updatedAt: draftNotes.updatedAt,
  taskId: tasks.id,
  taskTitle: sql<string | null>`${taskLabelSql}`,
};

type SummaryRow = { id: string; title: string; head: string; updatedAt: Date; taskId: string | null; taskTitle: string | null };

const taskOf = (row: { taskId: string | null; taskTitle: string | null }): DraftTask | null => (row.taskId !== null && row.taskTitle !== null ? { id: row.taskId, title: row.taskTitle } : null);

const toSummary = (row: SummaryRow): DraftSummary => ({ id: row.id, title: row.title, excerpt: draftExcerpt(row.head), updatedAt: row.updatedAt.toISOString(), task: taskOf(row) });

async function selectSummaries(viewer: Viewer): Promise<DraftSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(draftNotes)
    .leftJoin(tasks, readableTask(viewer))
    .where(own(viewer))
    .orderBy(desc(draftNotes.updatedAt), desc(draftNotes.createdAt))
    .limit(LIMITS.draftsPerPerson);
  return rows.map(toSummary);
}

/**
 * The one note of the 2026-11-04 notepad becomes the person's first draft, once: copied into `draft_notes` with
 * its own date, and the old row emptied so it is never copied twice (the row lock makes two requests arriving
 * together agree on who did it). Returns whether anything was carried over.
 */
async function carryOldNote(viewer: Viewer): Promise<boolean> {
  return db.transaction(async (tx) => {
    const mine = and(eq(drafts.userId, viewer.userId), eq(drafts.orgId, viewer.orgId));
    const [old] = await tx.select({ body: drafts.body, updatedAt: drafts.updatedAt }).from(drafts).where(mine).for("update");
    if (!old || old.body.trim() === "") return false;
    await tx.insert(draftNotes).values({ userId: viewer.userId, orgId: viewer.orgId, title: "", body: old.body, createdAt: old.updatedAt, updatedAt: old.updatedAt });
    await tx.update(drafts).set({ body: "" }).where(mine);
    return true;
  });
}

/** The viewer's drafts, the latest change first. A person with none yet gets their old notepad's text as the first. */
export async function listDrafts(viewer: Viewer): Promise<DraftSummary[]> {
  const found = await selectSummaries(viewer);
  if (found.length > 0) return found;
  return (await carryOldNote(viewer)) ? selectSummaries(viewer) : found;
}

/** One of the viewer's drafts with its text; null when it is not theirs or does not exist. */
export async function readDraftNote(viewer: Viewer, id: string): Promise<DraftNote | null> {
  const [row] = await db
    .select({ ...summaryColumns, body: draftNotes.body })
    .from(draftNotes)
    .leftJoin(tasks, readableTask(viewer))
    .where(and(own(viewer), eq(draftNotes.id, id)));
  return row ? { ...toSummary(row), body: row.body } : null;
}

/** How many drafts the viewer keeps here (there is a cap: LIMITS.draftsPerPerson). */
export async function countDrafts(handle: Handle, viewer: Viewer): Promise<number> {
  const [row] = await handle.select({ n: sql<number>`count(*)::int` }).from(draftNotes).where(own(viewer));
  return row?.n ?? 0;
}

/** A new draft of the viewer's; `task` is the task it starts attached to, already checked by the caller. */
export async function createDraftNote(handle: Handle, viewer: Viewer, input: { title: string; body: string; task: DraftTask | null }): Promise<DraftNote> {
  const now = new Date();
  const [row] = await handle
    .insert(draftNotes)
    .values({ userId: viewer.userId, orgId: viewer.orgId, title: input.title, body: input.body, taskId: input.task?.id ?? null, createdAt: now, updatedAt: now })
    .returning({ id: draftNotes.id });
  return { id: row.id, title: input.title, body: input.body, excerpt: draftExcerpt(input.body), updatedAt: now.toISOString(), task: input.task };
}

/** Writes a draft's title and text (it is one note), returning when; null when it is not the viewer's. */
export async function writeDraftNote(handle: Handle, viewer: Viewer, id: string, input: { title: string; body: string }): Promise<Date | null> {
  const now = new Date();
  const rows = await handle
    .update(draftNotes)
    .set({ title: input.title, body: input.body, updatedAt: now })
    .where(and(own(viewer), eq(draftNotes.id, id)))
    .returning({ id: draftNotes.id });
  return rows.length > 0 ? now : null;
}

/** Deletes one of the viewer's drafts; false when there was nothing of theirs to delete. */
export async function deleteDraftNote(handle: Handle, viewer: Viewer, id: string): Promise<boolean> {
  const rows = await handle
    .delete(draftNotes)
    .where(and(own(viewer), eq(draftNotes.id, id)))
    .returning({ id: draftNotes.id });
  return rows.length > 0;
}

/** Attaches one of the viewer's drafts to a task (checked by the caller), or lets go of it with null. The text's own date is left alone. */
export async function setDraftTask(handle: Handle, viewer: Viewer, id: string, taskId: string | null): Promise<boolean> {
  const rows = await handle
    .update(draftNotes)
    .set({ taskId })
    .where(and(own(viewer), eq(draftNotes.id, id)))
    .returning({ id: draftNotes.id });
  return rows.length > 0;
}

/** The viewer's own drafts attached to a task, the latest change first. Nobody else's are ever read here. */
export async function draftsForTask(viewer: Viewer, taskId: string): Promise<TaskDraft[]> {
  const rows = await db
    .select({
      id: draftNotes.id,
      title: draftNotes.title,
      body: sql<string>`left(${draftNotes.body}, ${TASK_DRAFT_PREVIEW})`,
      length: sql<number>`char_length(${draftNotes.body})`,
      updatedAt: draftNotes.updatedAt,
    })
    .from(draftNotes)
    .where(and(own(viewer), eq(draftNotes.taskId, taskId)))
    .orderBy(desc(draftNotes.updatedAt));
  return rows.map((row) => ({ id: row.id, title: row.title, excerpt: draftExcerpt(row.body), body: row.body, truncated: row.length > TASK_DRAFT_PREVIEW, updatedAt: row.updatedAt.toISOString() }));
}
