"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { LIMITS } from "@/lib/limits";
import { requiredText } from "@/lib/sanitize";
import { db } from "@/db";
import { notificationPreferences, users } from "@/db/schema";
import { ok, runAction, type ActionResult } from "@/lib/action-result";
import { log } from "@/lib/log";
import { isValidTimeZone } from "@/lib/time";
import { requireUser } from "@/lib/viewer";

// The signed-in person's own settings: name, timezone and which events also arrive by email. These belong to
// the user, not to a workspace, so they follow them into every workspace they're in.

const profileSchema = z.object({
  name: requiredText(1, LIMITS.memberName, "Enter your name.", "Keep it under 80 characters."),
  /** Empty means "use the workspace's timezone". */
  timezone: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidTimeZone(value), "Pick a timezone from the list."),
});

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  return runAction("profile.update", profileSchema, input, async ({ name, timezone }) => {
    const user = await requireUser();
    await db
      .update(users)
      .set({ name, timezone: timezone === "" ? null : timezone })
      .where(eq(users.id, user.id));
    log.info("profile.updated", { userId: user.id });
    refresh();
    return ok(undefined, "Profile saved.");
  });
}

const preferencesSchema = z
  .object({
    emailAssignment: z.boolean(),
    emailApproval: z.boolean(),
    emailHandover: z.boolean(),
    emailBlocked: z.boolean(),
    emailRequestDecision: z.boolean(),
    emailComment: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Nothing to save.");

/**
 * Saves whichever switches changed (each switch saves on its own toggle). The row is created on first
 * change; until then the column defaults are the preferences.
 */
export async function updatePreferences(input: z.input<typeof preferencesSchema>): Promise<ActionResult> {
  return runAction("profile.preferences", preferencesSchema, input, async (changes) => {
    const user = await requireUser();
    await db
      .insert(notificationPreferences)
      .values({ userId: user.id, ...changes })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: changes });
    log.info("profile.preferences_updated", { userId: user.id, changes });
    refresh();
    return ok(undefined, "Email preference saved.");
  });
}
