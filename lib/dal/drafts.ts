import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { drafts } from "@/db/schema";
import type { Viewer } from "@/lib/permissions";

// The Draft tab's notepad (docs/PLAN.md, 2026-11-04 log): one running note per person per workspace. The browser
// autosaves it; the floating notepad and the tab read the same row.

export type Draft = { body: string; updatedAt: string | null };

export async function readDraft(viewer: Viewer): Promise<Draft> {
  const [row] = await db
    .select({ body: drafts.body, updatedAt: drafts.updatedAt })
    .from(drafts)
    .where(and(eq(drafts.userId, viewer.userId), eq(drafts.orgId, viewer.orgId)));
  return row ? { body: row.body, updatedAt: row.updatedAt.toISOString() } : { body: "", updatedAt: null };
}

/** Writes the whole note (it is one text), returning when. */
export async function writeDraft(handle: Tx | typeof db, viewer: Viewer, body: string): Promise<Date> {
  const now = new Date();
  await handle
    .insert(drafts)
    .values({ userId: viewer.userId, orgId: viewer.orgId, body, updatedAt: now })
    .onConflictDoUpdate({ target: [drafts.userId, drafts.orgId], set: { body: sql`excluded.body`, updatedAt: now } });
  return now;
}
