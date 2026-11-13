"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { getOrgConfig, saveOrgConfig } from "@/lib/dal/org-config";
import { saveStatusRow, statusRowsFor, statusesFor } from "@/lib/dal/statuses";
import { ORG_ROLES } from "@/lib/constants";
import { requireOrgAdmin } from "@/lib/guards";
import { HOME_TAB_KEYS, tabsForRole } from "@/lib/home-tabs";
import { log } from "@/lib/log";
import { encryptSecret } from "@/lib/secrets";
import { newStatusKey, STATUS_ICONS, STATUS_TONES, statusOf } from "@/lib/statuses";

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
  role: z.enum(ORG_ROLES),
  order: z.array(z.enum(HOME_TAB_KEYS)).max(HOME_TAB_KEYS.length),
});

/** The workspace's default /home tab order for one role (first tab is the landing). An empty list clears that role's override. */
export async function setHomeTabOrder(input: z.input<typeof tabOrderSchema>): Promise<ActionResult> {
  return runAction("config.tab_order", tabOrderSchema, input, async (data) => {
    const { viewer } = await requireOrgAdmin();
    const allowed = data.order.filter((tab) => tabsForRole(data.role).includes(tab));
    const existing = await getOrgConfig(viewer.orgId);
    const homeTabOrder = { ...(existing.homeTabOrder ?? {}) };
    if (allowed.length > 0) homeTabOrder[data.role] = allowed;
    else delete homeTabOrder[data.role];
    await db.transaction(async (tx) => saveOrgConfig(viewer.orgId, { homeTabOrder }, viewer.userId, tx));
    log.info("config.tab_order_saved", { orgId: viewer.orgId, role: data.role, order: allowed.join(","), by: viewer.userId });
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

const statusSchema = z.object({
  /** A built-in key edits that status; a custom_* key edits that status; empty creates a new custom status. */
  key: z.string().regex(/^([a-z0-9_]{0,64})$/).default(""),
  label: z.string().trim().min(1).max(40),
  icon: z.string().refine((icon) => icon in STATUS_ICONS, "Pick one of the icons."),
  tone: z.enum(STATUS_TONES),
  closed: z.boolean(),
});

/**
 * Creates or edits one status. Built-ins keep their key and behaviour (a rename is label-only); a new status
 * is minted a `custom_*` key and lands at the end. Completed and Merged are structurally closed — their flag
 * is not accepted off.
 */
export async function saveTaskStatus(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  return runAction("config.status_save", statusSchema, input, async (data) => {
    const { viewer } = await requireOrgAdmin();
    const catalog = await statusesFor(viewer.orgId);
    const creating = data.key === "";
    if (!creating) {
      const existing = statusOf(catalog, data.key);
      if (existing === undefined) return fail("That status doesn't exist.");
      if (existing.archived) return fail("Restore the status before editing it.");
    }
    const key = creating ? newStatusKey() : data.key;
    const def = statusOf(catalog, key);
    if (def !== undefined && (def.kind === "completed" || def.kind === "merged") && !data.closed) return fail(`"${def.label}" is how a task finishes — it can't be an open status.`);
    const position = def?.position ?? Math.max(0, ...catalog.map((status) => status.position + 1));
    await db.transaction(async (tx) =>
      saveStatusRow(viewer.orgId, { key, label: data.label, icon: data.icon, tone: data.tone, closed: data.closed, position, archivedAt: null }, viewer.userId, tx),
    );
    log.info("config.status_saved", { orgId: viewer.orgId, key, label: data.label, creating, by: viewer.userId });
    refresh();
    return ok(undefined, creating ? "Status added." : "Status saved.");
  });
}

const archiveSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,64}$/),
  archived: z.boolean(),
});

/**
 * Archives or restores a status (never deletes). An archived status keeps rendering on the tasks that have
 * it but leaves every picker; restoring brings it back. A built-in's first archive writes its row.
 */
export async function setStatusArchived(input: z.input<typeof archiveSchema>): Promise<ActionResult> {
  return runAction("config.status_archive", archiveSchema, input, async (data) => {
    const { viewer } = await requireOrgAdmin();
    const catalog = await statusesFor(viewer.orgId);
    const def = statusOf(catalog, data.key);
    if (def === undefined) return fail("That status doesn't exist.");
    if (data.archived && catalog.filter((status) => !status.archived).length === 1) return fail("The workspace needs one status left to pick.");
    await db.transaction(async (tx) =>
      saveStatusRow(viewer.orgId, { key: def.key, label: def.label, icon: def.icon, tone: def.tone, closed: def.closed, position: def.position, archivedAt: data.archived ? new Date() : null }, viewer.userId, tx),
    );
    log.info("config.status_archive", { orgId: viewer.orgId, key: data.key, archived: data.archived, by: viewer.userId });
    refresh();
    return ok(undefined, data.archived ? `"${def.label}" archived — existing tasks keep it.` : `"${def.label}" restored.`);
  });
}

const reorderSchema = z.object({ keys: z.array(z.string().regex(/^[a-z0-9_]{1,64}$/)).min(1) });

/** Saves the picker's order, top to bottom. Every status (edited or not) gets its row so the order sticks. */
export async function reorderTaskStatuses(input: z.input<typeof reorderSchema>): Promise<ActionResult> {
  return runAction("config.status_reorder", reorderSchema, input, async (data) => {
    const { viewer } = await requireOrgAdmin();
    const catalog = await statusesFor(viewer.orgId);
    const rows = await statusRowsFor(viewer.orgId);
    const archivedAtByKey = new Map(rows.map((row) => [row.key, row.archivedAt]));
    const byKey = new Map(catalog.map((status) => [status.key, status]));
    const ordered = data.keys.map((key) => byKey.get(key)).filter((status) => status !== undefined);
    for (const status of catalog) if (!ordered.includes(status)) ordered.push(status);
    await db.transaction(async (tx) => {
      for (const [position, status] of ordered.entries()) {
        await saveStatusRow(viewer.orgId, { key: status.key, label: status.label, icon: status.icon, tone: status.tone, closed: status.closed, position, archivedAt: archivedAtByKey.get(status.key) ?? null }, viewer.userId, tx);
      }
    });
    log.info("config.status_reordered", { orgId: viewer.orgId, count: ordered.length, by: viewer.userId });
    refresh();
    return ok(undefined, "Status order saved.");
  });
}
