"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { countDrafts, createDraftNote, deleteDraftNote, listDrafts, readDraftNote, setDraftTask, writeDraftNote } from "@/lib/dal/drafts";
import { getTaskBasics } from "@/lib/dal/tasks";
import type { DraftNote, DraftSummary, DraftTask } from "@/lib/drafts";
import { LIMITS } from "@/lib/limits";
import { log } from "@/lib/log";
import { canReadPlanning, canReadTask, type Viewer } from "@/lib/permissions";
import { cappedText, optionalText } from "@/lib/sanitize";
import { closerLabel } from "@/lib/tasks/closer";
import { requireViewer } from "@/lib/viewer";

// The Draft tab's notes (docs/PLAN.md, 2026-11-04 and 2026-11-11 logs): a person's list of titled drafts, saved as
// they are typed, any of which may be attached to one task. A draft is its author's alone: every call here reads
// and writes the viewer's own rows, and attaching only needs the viewer to be able to read the task. Saving does
// not refresh the page (the notepad's store already shows what was typed, and nothing else on screen depends on
// it); creating, deleting and attaching do, because the task page lists the drafts attached to it.

const id = z.string().min(1).max(64);

/** Everyone in a workspace may keep drafts there. */
async function draftViewer(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!canReadPlanning(viewer)) throw new GuardError("forbidden");
  return viewer;
}

/** The task a draft may be attached to: one the viewer can read, named the way lists name it. */
async function attachableTask(viewer: Viewer, taskId: string): Promise<DraftTask> {
  const task = await getTaskBasics(viewer, taskId);
  if (task === null || !canReadTask(viewer, task.scope)) throw new GuardError("not_found", "That task doesn't exist, or you can't see it.");
  return { id: task.id, title: task.goalCloser ? closerLabel(task.title, task.goalTitle) : task.title };
}

const listSchema = z.object({ prefer: z.string().max(64).default("") });

/**
 * The viewer's drafts and the one to open: `prefer` when it is still theirs (the draft this browser had open),
 * else the one changed last. The floating notepad loads this on a page that didn't render the Draft tab.
 */
export async function loadDrafts(input: z.input<typeof listSchema> = {}): Promise<ActionResult<{ drafts: DraftSummary[]; current: DraftNote | null }>> {
  return runAction("drafts.list", listSchema, input, async (data) => {
    const viewer = await draftViewer();
    const drafts = await listDrafts(viewer);
    const wanted = drafts.find((draft) => draft.id === data.prefer) ?? drafts[0];
    return ok({ drafts, current: wanted ? await readDraftNote(viewer, wanted.id) : null });
  });
}

const oneSchema = z.object({ id });

/** One draft with its text (picked in the list). */
export async function loadDraft(input: z.input<typeof oneSchema>): Promise<ActionResult<DraftNote>> {
  return runAction("drafts.load", oneSchema, input, async (data) => {
    const viewer = await draftViewer();
    const draft = await readDraftNote(viewer, data.id);
    if (draft === null) throw new GuardError("not_found", "That draft doesn't exist any more.");
    return ok(draft);
  });
}

const saveSchema = z.object({ id, title: optionalText(LIMITS.draftTitle), body: cappedText(LIMITS.draft) });

/** Saves a draft's title and text; the browser debounces, so this runs a second or so after the last keystroke. */
export async function saveDraft(input: z.input<typeof saveSchema>): Promise<ActionResult<{ updatedAt: string }>> {
  return runAction("drafts.save", saveSchema, input, async (data) => {
    const viewer = await draftViewer();
    const at = await writeDraftNote(db, viewer, data.id, { title: data.title, body: data.body });
    if (at === null) throw new GuardError("not_found", "That draft doesn't exist any more.");
    return ok({ updatedAt: at.toISOString() });
  });
}

const createSchema = z.object({ title: optionalText(LIMITS.draftTitle), body: cappedText(LIMITS.draft).default(""), taskId: z.string().max(64).default("") });

/** A new draft, empty or with what was already typed, optionally attached to a task from the start. */
export async function createDraft(input: z.input<typeof createSchema> = {}): Promise<ActionResult<DraftNote>> {
  return runAction("drafts.create", createSchema, input, async (data) => {
    const viewer = await draftViewer();
    if ((await countDrafts(db, viewer)) >= LIMITS.draftsPerPerson) return fail(`You have ${LIMITS.draftsPerPerson} drafts here, which is the most one person can keep. Delete one you no longer need first.`);
    const task = data.taskId ? await attachableTask(viewer, data.taskId) : null;
    const draft = await createDraftNote(db, viewer, { title: data.title, body: data.body, task });
    log.info("drafts.created", { orgId: viewer.orgId, draftId: draft.id, taskId: task?.id ?? null, by: viewer.userId });
    refresh();
    return ok(draft);
  });
}

/** Deletes a draft for good. */
export async function deleteDraft(input: z.input<typeof oneSchema>): Promise<ActionResult> {
  return runAction("drafts.delete", oneSchema, input, async (data) => {
    const viewer = await draftViewer();
    if (!(await deleteDraftNote(db, viewer, data.id))) throw new GuardError("not_found", "That draft doesn't exist any more.");
    log.info("drafts.deleted", { orgId: viewer.orgId, draftId: data.id, by: viewer.userId });
    refresh();
    return ok(undefined, "Draft deleted.");
  });
}

const attachSchema = z.object({ id, taskId: z.string().max(64).default("") });

/**
 * Attaches a draft to a task the viewer can read, or (with no task) detaches it. The draft stays private: the
 * task page shows it to its author only, so nothing is written to the task and nobody is told.
 */
export async function attachDraft(input: z.input<typeof attachSchema>): Promise<ActionResult<{ task: DraftTask | null }>> {
  return runAction("drafts.attach", attachSchema, input, async (data) => {
    const viewer = await draftViewer();
    const task = data.taskId ? await attachableTask(viewer, data.taskId) : null;
    if (!(await setDraftTask(db, viewer, data.id, task?.id ?? null))) throw new GuardError("not_found", "That draft doesn't exist any more.");
    log.info("drafts.attached", { orgId: viewer.orgId, draftId: data.id, taskId: task?.id ?? null, by: viewer.userId });
    refresh();
    return ok({ task }, task ? `Attached to “${task.title}”. Only you can see it there.` : "Detached from the task.");
  });
}
