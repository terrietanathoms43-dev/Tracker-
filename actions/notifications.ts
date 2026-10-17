"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { ok, runAction, type ActionResult } from "@/lib/action-result";
import { log } from "@/lib/log";
import { requireViewer } from "@/lib/viewer";

// Reading notifications. Both actions only ever touch the viewer's own rows in the active workspace, and
// both refresh() so the shell's unread count (rendered in the layout) is right on the next screen.

const idSchema = z.object({ id: z.string().min(1).max(64) });

/** Marks one notification read. Called by the row just before it navigates to what the notification is about. */
export async function markNotificationRead(input: z.input<typeof idSchema>): Promise<ActionResult> {
  return runAction("notifications.read", idSchema, input, async ({ id }) => {
    const viewer = await requireViewer();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.id, id), eq(notifications.userId, viewer.userId), eq(notifications.orgId, viewer.orgId), isNull(notifications.readAt)),
      );
    refresh();
    return ok(undefined);
  });
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return runAction("notifications.read_all", z.object({}), {}, async () => {
    const viewer = await requireViewer();
    const read = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, viewer.userId), eq(notifications.orgId, viewer.orgId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    log.info("notifications.read_all", { orgId: viewer.orgId, userId: viewer.userId, count: read.length });
    refresh();
    return ok(undefined, "All caught up.");
  });
}
