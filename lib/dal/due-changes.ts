import "server-only";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { projects, taskDueChanges, tasks, users } from "@/db/schema";
import { taskLabelSql } from "@/lib/dal/tasks";
import { isAdmin, type Viewer } from "@/lib/permissions";
import type { DueChangeKind } from "@/lib/tasks/due-change";
import type { Person } from "@/lib/tasks/types";
import { dayKey } from "@/lib/time";

// Due-date changes waiting for an admin (docs/PLAN.md, 2026-11-24 log; lib/tasks/due-change.ts has the rules,
// actions/due-changes.ts writes them). Every read is scoped to the viewer's workspace in SQL.

/** A change someone asked for that no admin has decided yet, as the task page and the Proposals page show it. */
export type PendingDueChange = {
  id: string;
  taskId: string;
  taskTitle: string;
  project: string | null;
  kind: DueChangeKind;
  /** The due date the task had when it was asked for (and still has: the change has not taken effect). */
  from: string | null;
  to: string | null;
  reason: string;
  requestedBy: Person;
  /** The calendar day it was asked for, in the viewer's timezone. */
  requestedDay: string;
};

const pendingRows = (where: SQL | undefined) =>
  db
    .select({
      id: taskDueChanges.id,
      taskId: taskDueChanges.taskId,
      taskTitle: taskLabelSql,
      project: projects.name,
      kind: taskDueChanges.kind,
      from: taskDueChanges.fromDate,
      to: taskDueChanges.toDate,
      reason: taskDueChanges.reason,
      requestedAt: taskDueChanges.createdAt,
      requestedBy: sql<Person>`json_build_object('id', ${users.id}, 'name', ${users.name}, 'email', ${users.email}, 'image', ${users.image})`,
    })
    .from(taskDueChanges)
    .innerJoin(tasks, eq(tasks.id, taskDueChanges.taskId))
    .innerJoin(users, eq(users.id, taskDueChanges.requestedBy))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(where)
    .orderBy(asc(taskDueChanges.createdAt));

const shape = ({ requestedAt, ...row }: Awaited<ReturnType<typeof pendingRows>>[number], viewer: Viewer): PendingDueChange => ({ ...row, requestedDay: dayKey(requestedAt, viewer.timezone) });

/** The change waiting on one task, if any (there is at most one). The caller has already checked the viewer may read the task. */
export async function pendingDueChangeForTask(viewer: Viewer, taskId: string): Promise<PendingDueChange | null> {
  const [row] = await pendingRows(and(eq(taskDueChanges.orgId, viewer.orgId), eq(taskDueChanges.taskId, taskId), eq(taskDueChanges.status, "pending")));
  return row ? shape(row, viewer) : null;
}

/**
 * The changes waiting in the workspace, oldest first: all of them for an admin (who decides them), a person's own
 * for everyone else. `project` narrows them like every list: "" for all, or a project id.
 */
export async function pendingDueChanges(viewer: Viewer, project: string): Promise<PendingDueChange[]> {
  const rows = await pendingRows(
    and(
      eq(taskDueChanges.orgId, viewer.orgId),
      eq(taskDueChanges.status, "pending"),
      isAdmin(viewer) ? undefined : eq(taskDueChanges.requestedBy, viewer.userId),
      project === "" ? undefined : eq(tasks.projectId, project),
    ),
  );
  return rows.map((row) => shape(row, viewer));
}

/** Whether a change is already waiting on a task, inside a transaction that holds the task's row. */
export async function hasPendingDueChange(tx: Tx, orgId: string, taskId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: taskDueChanges.id })
    .from(taskDueChanges)
    .where(and(eq(taskDueChanges.orgId, orgId), eq(taskDueChanges.taskId, taskId), eq(taskDueChanges.status, "pending")))
    .limit(1);
  return row !== undefined;
}

/** One change, locked for its decision. */
export async function lockDueChange(tx: Tx, orgId: string, id: string) {
  const [row] = await tx
    .select()
    .from(taskDueChanges)
    .where(and(eq(taskDueChanges.id, id), eq(taskDueChanges.orgId, orgId)))
    .for("update");
  return row ?? null;
}
