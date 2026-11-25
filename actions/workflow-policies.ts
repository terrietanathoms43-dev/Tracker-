"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { goals, projects, workflowPolicies, workflowPolicyAttachments } from "@/db/schema";
import { GuardError, ok, runAction } from "@/lib/action-result";
import { canEditTask, canManagePlanning, isAdmin } from "@/lib/permissions";
import { lockTask } from "@/lib/dal/tasks";
import { attachTaskPolicies, materializePolicies, materializeScopePolicies } from "@/lib/dal/workflow-policies";
import { statusDef } from "@/lib/statuses";
import { requireViewer } from "@/lib/viewer";

const id = z.string().min(1).max(64);
const scope = z.object({ kind: z.enum(["workspace", "project", "goal"]), id });
const createSchema = z.object({ scope, name: z.string().trim().min(1).max(100), labels: z.array(z.string().trim().min(1).max(200)).min(1).max(20), automatic: z.boolean() });
const attachSchema = z.object({ scope, policyId: id });
async function validateScope(viewer: Awaited<ReturnType<typeof requireViewer>>, target: z.infer<typeof scope>) {
  if (target.kind === "workspace") {
    if (!isAdmin(viewer) || target.id !== viewer.orgId) throw new GuardError("forbidden");
  } else {
    if (!canManagePlanning(viewer)) throw new GuardError("forbidden");
    const table = target.kind === "project" ? projects : goals;
    const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.orgId, viewer.orgId), eq(table.id, target.id)));
    if (!row) throw new GuardError("not_found");
  }
}
export async function createWorkflowPolicy(input: z.input<typeof createSchema>) {
  return runAction("policies.create", createSchema, input, async (data) => {
    const viewer = await requireViewer();
    await validateScope(viewer, data.scope);
    await db.transaction(async (tx) => {
      const [policy] = await tx.insert(workflowPolicies).values({ orgId: viewer.orgId, ownerKind: data.scope.kind, ownerId: data.scope.id, name: data.name, templates: data.labels.map((label) => ({ id: crypto.randomUUID(), label })), createdBy: viewer.userId }).returning({ id: workflowPolicies.id });
      if (data.automatic) {
        await tx.insert(workflowPolicyAttachments).values({ orgId: viewer.orgId, policyId: policy.id, scopeKind: data.scope.kind, scopeId: data.scope.id, createdBy: viewer.userId }).onConflictDoNothing();
        await materializeScopePolicies(tx, viewer, data.scope, new Date());
      }
    });
    refresh();
    return ok(undefined, "Policy created.");
  });
}
export async function attachWorkflowPolicy(input: z.input<typeof attachSchema>) {
  return runAction("policies.attach", attachSchema, input, async (data) => {
    const viewer = await requireViewer();
    await validateScope(viewer, data.scope);
    await db.transaction(async (tx) => {
      const [policy] = await tx.select({ id: workflowPolicies.id }).from(workflowPolicies).where(and(eq(workflowPolicies.orgId, viewer.orgId), eq(workflowPolicies.id, data.policyId)));
      if (!policy) throw new GuardError("not_found");
      await tx.insert(workflowPolicyAttachments).values({ orgId: viewer.orgId, policyId: policy.id, scopeKind: data.scope.kind, scopeId: data.scope.id, createdBy: viewer.userId }).onConflictDoNothing();
      await materializeScopePolicies(tx, viewer, data.scope, new Date());
    });
    refresh();
    return ok(undefined, "Policy attached to current open and future tasks.");
  });
}
const applySchema = z.object({ taskId: id, policyIds: z.array(id).max(30) });
export async function applyWorkflowPolicies(input: z.input<typeof applySchema>) {
  return runAction("policies.apply", applySchema, input, async (data) => {
    const viewer = await requireViewer();
    await db.transaction(async (tx) => {
      const locked = await lockTask(tx, viewer.orgId, data.taskId, viewer.statuses);
      if (!locked) throw new GuardError("not_found");
      if (!canEditTask(viewer, locked.scope)) throw new GuardError("forbidden");
      const status = statusDef(viewer.statuses, locked.task.status);
      if (status.closed || status.kind === "awaiting_approval") throw new GuardError("conflict", "Reopen or send back the task before applying policies.");
      if (data.policyIds.length) await attachTaskPolicies(tx, viewer.orgId, data.taskId, data.policyIds, viewer.userId, new Date());
      else await materializePolicies(tx, viewer.orgId, data.taskId, viewer.userId, new Date());
    });
    refresh();
    return ok(undefined, "Policies applied.");
  });
}
