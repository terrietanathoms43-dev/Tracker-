import "server-only";
import { eq } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db";
import { orgConfig } from "@/db/schema";
import type { PermissionToggles } from "@/lib/permissions";

// The workspace's admin-panel settings (Settings → Workspace, admins only). No row means defaults:
// deployment env vars supply the AI key, CANONICAL_ORDER the tab order, and every permission toggle is off.

export type AiProvider = "anthropic" | "openai";

export type OrgConfig = {
  /** Workspace default for /home's tab order; a person's cookie may still reorder theirs (lib/home-tabs.ts). */
  homeTabOrder: string[] | null;
  /** Configured AI engine and key for capture; null = fall back to the deployment's env vars. */
  aiProvider: AiProvider | null;
  /** Encrypted (lib/secrets.ts) — never leaves the server. */
  aiApiKey: string | null;
  /** Last characters of the key, shown in the panel as the "configured" hint. */
  aiApiKeyTail: string | null;
  /** Admin-set switches: toggle key → boolean (PERMISSION_TOGGLES in lib/permissions.ts). */
  permissionOverrides: PermissionToggles;
};

const EMPTY: OrgConfig = { homeTabOrder: null, aiProvider: null, aiApiKey: null, aiApiKeyTail: null, permissionOverrides: {} };

/** The workspace's config row, or defaults when none exists yet. */
export async function getOrgConfig(orgId: string, executor: Db | Tx = db): Promise<OrgConfig> {
  const [row] = await executor.select().from(orgConfig).where(eq(orgConfig.orgId, orgId)).limit(1);
  if (!row) return EMPTY;
  return {
    homeTabOrder: row.homeTabOrder,
    aiProvider: row.aiProvider === "anthropic" || row.aiProvider === "openai" ? row.aiProvider : null,
    aiApiKey: row.aiApiKey,
    aiApiKeyTail: row.aiApiKeyTail,
    permissionOverrides: row.permissionOverrides ?? {},
  };
}

/** Writes any subset of the config columns; creates the row on first use. */
export async function saveOrgConfig(orgId: string, patch: Partial<OrgConfig>, by: string, tx: Tx): Promise<void> {
  await tx
    .insert(orgConfig)
    .values({ orgId, ...patch, updatedBy: by })
    .onConflictDoUpdate({ target: orgConfig.orgId, set: { ...patch, updatedBy: by, updatedAt: new Date() } });
}
