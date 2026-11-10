"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { getOrgConfig, saveOrgConfig } from "@/lib/dal/org-config";
import { requireOrgAdmin } from "@/lib/guards";
import { HOME_TAB_KEYS } from "@/lib/home-tabs";
import { log } from "@/lib/log";
import { encryptSecret } from "@/lib/secrets";

// The admin panel on Settings → Workspace: the AI provider and key, the workspace's default /home tab order,
// and the permission switches. Admins only (requireOrgAdmin); the API key is stored encrypted (lib/secrets.ts)
// and never read back to a client — the panel shows only its tail.

const aiSchema = z.object({
  provider: z.enum(["anthropic", "openai", ""]).default(""),
  apiKey: z.string().trim().max(256).default(""),
});

/**
 * The workspace's AI provider and key for capture. An empty provider clears the override (the deployment's
 * env vars take over); an empty key keeps the stored one, so switching provider alone doesn't wipe it.
 */
export async function setAiConfig(input: z.input<typeof aiSchema>): Promise<ActionResult> {
  return runAction("config.ai", aiSchema, input, async (data) => {
    const { viewer } = await requireOrgAdmin();
    const existing = await getOrgConfig(viewer.orgId);
    if (data.provider !== "" && data.apiKey === "" && existing.aiApiKey === null) return fail("Enter the API key to switch this on.");
    const patch =
      data.provider === ""
        ? { aiProvider: null, aiApiKey: null, aiApiKeyTail: null }
        : { aiProvider: data.provider, ...(data.apiKey !== "" ? { aiApiKey: encryptSecret(data.apiKey), aiApiKeyTail: data.apiKey.slice(-4) } : {}) };
    await db.transaction(async (tx) => saveOrgConfig(viewer.orgId, patch, viewer.userId, tx));
    log.info("config.ai_saved", { orgId: viewer.orgId, provider: data.provider || "off", keyChanged: data.apiKey !== "", by: viewer.userId });
    refresh();
    return ok(undefined, "AI settings saved.");
  });
}

const tabOrderSchema = z.object({
  order: z.array(z.enum(HOME_TAB_KEYS)).max(HOME_TAB_KEYS.length),
});

/** The workspace's default /home tab order (first tab is the landing). An empty list clears it back to built-in. */
export async function setHomeTabOrder(input: z.input<typeof tabOrderSchema>): Promise<ActionResult> {
  return runAction("config.tab_order", tabOrderSchema, input, async (data) => {
    const { viewer } = await requireOrgAdmin();
    await db.transaction(async (tx) => saveOrgConfig(viewer.orgId, { homeTabOrder: data.order.length > 0 ? data.order : null }, viewer.userId, tx));
    log.info("config.tab_order_saved", { orgId: viewer.orgId, order: data.order.join(","), by: viewer.userId });
    refresh();
    return ok(undefined, "Tab order saved.");
  });
}

const togglesSchema = z.object({
  membersCanPlan: z.boolean(),
  membersCanInvite: z.boolean(),
  membersCanDeleteOwnTasks: z.boolean(),
});

/** The workspace's permission switches (PERMISSION_TOGGLES). Each only ever widens a predicate. */
export async function setPermissionToggles(input: z.input<typeof togglesSchema>): Promise<ActionResult> {
  return runAction("config.permissions", togglesSchema, input, async (data) => {
    const { viewer } = await requireOrgAdmin();
    await db.transaction(async (tx) => saveOrgConfig(viewer.orgId, { permissionOverrides: data }, viewer.userId, tx));
    log.info("config.permissions_saved", { orgId: viewer.orgId, ...data, by: viewer.userId });
    refresh();
    return ok(undefined, "Permissions saved.");
  });
}
