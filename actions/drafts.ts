"use server";

import { z } from "zod";
import { db } from "@/db";
import { GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { readDraft, writeDraft, type Draft } from "@/lib/dal/drafts";
import { LIMITS } from "@/lib/limits";
import { canReadPlanning } from "@/lib/permissions";
import { cappedText } from "@/lib/sanitize";
import { requireViewer } from "@/lib/viewer";

// The Draft tab's notepad (docs/PLAN.md, 2026-11-04 log): read once, saved as it is typed. Neither call refreshes
// the page: notes are the person's own, and nothing else on screen depends on them.

const saveSchema = z.object({ body: cappedText(LIMITS.draft) });

/** Saves the whole note; the browser debounces, so this runs a second or so after the last keystroke. */
export async function saveDraft(input: z.input<typeof saveSchema>): Promise<ActionResult<{ updatedAt: string }>> {
  return runAction("drafts.save", saveSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canReadPlanning(viewer)) throw new GuardError("forbidden");
    const at = await writeDraft(db, viewer, data.body);
    return ok({ updatedAt: at.toISOString() });
  });
}

/** The note as last saved (the floating notepad loads it on first open). */
export async function loadDraft(): Promise<ActionResult<Draft>> {
  return runAction("drafts.load", z.object({}), {}, async () => {
    const viewer = await requireViewer();
    if (!canReadPlanning(viewer)) throw new GuardError("forbidden");
    return ok(await readDraft(viewer));
  });
}
