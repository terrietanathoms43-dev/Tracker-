import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db, type Db, type Tx } from "@/db";
import { tasks, taskStatuses } from "@/db/schema";
import { resolveStatuses, type StatusCatalog, type StatusRow } from "@/lib/statuses";

// The workspace's task statuses: the nine defaults overlaid with the org's task_statuses rows (edits to
// built-ins plus its own customs). Resolved once per request (React cache, like requireViewer) — every
// DAL read and server component asks for it here.

export const statusesFor = cache(async (orgId: string, executor: Db | Tx = db): Promise<StatusCatalog> => {
  const rows = await executor
    .select({ key: taskStatuses.key, label: taskStatuses.label, icon: taskStatuses.icon, tone: taskStatuses.tone, closed: taskStatuses.closed, archivedAt: taskStatuses.archivedAt, position: taskStatuses.position })
    .from(taskStatuses)
    .where(eq(taskStatuses.orgId, orgId))
    .orderBy(asc(taskStatuses.position));
  return resolveStatuses(rows);
});

export type { StatusRow };

/** The org's raw task_statuses rows (archivedAt kept) — for actions that rewrite several rows at once. */
export async function statusRowsFor(orgId: string, executor: Db | Tx = db): Promise<StatusRow[]> {
  return executor
    .select({ key: taskStatuses.key, label: taskStatuses.label, icon: taskStatuses.icon, tone: taskStatuses.tone, closed: taskStatuses.closed, archivedAt: taskStatuses.archivedAt, position: taskStatuses.position })
    .from(taskStatuses)
    .where(eq(taskStatuses.orgId, orgId))
    .orderBy(asc(taskStatuses.position));
}

/** Live tasks on each status key — the archive dialog's "N tasks keep this status" warning. */
export const statusUsageFor = cache(async (orgId: string): Promise<Record<string, number>> => {
  const rows = await db
    .select({ status: tasks.status, count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.orgId, orgId))
    .groupBy(tasks.status);
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
});

/** Inserts or updates the row for one status key in this workspace. */
export async function saveStatusRow(orgId: string, row: Omit<StatusRow, "archivedAt"> & { archivedAt?: Date | null }, by: string, tx: Tx): Promise<void> {
  await tx
    .insert(taskStatuses)
    .values({ orgId, key: row.key, label: row.label, icon: row.icon, tone: row.tone, closed: row.closed, position: row.position, archivedAt: row.archivedAt ?? null, updatedBy: by })
    .onConflictDoUpdate({
      target: [taskStatuses.orgId, taskStatuses.key],
      set: { label: row.label, icon: row.icon, tone: row.tone, closed: row.closed, position: row.position, archivedAt: row.archivedAt ?? null, updatedBy: by, updatedAt: new Date() },
    });
}
