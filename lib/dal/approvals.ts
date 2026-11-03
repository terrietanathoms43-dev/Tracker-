import "server-only";
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Tx } from "@/db";
import { approvalBypass, approvalSteps, goals, organizationMembers, projects, taskApprovals, tasks, users } from "@/db/schema";
import type { ProposalStatus, TaskPriority } from "@/lib/constants";
import { canDecideProposal, currentStep, type ApprovalPolicy, type ApprovalStepState } from "@/lib/approvals/policy";
import { approvalsJson, assigneesJson, projectCondition } from "@/lib/dal/tasks";
import { canReadPlanning, type Viewer } from "@/lib/permissions";
import type { ApprovalStepView, Person } from "@/lib/tasks/types";

// Proposals (docs/PLAN.md, 2026-11-03 log): the sign-off chains projects and goals keep, the chain a task carries
// once proposed, and the Proposals page's lists. Every read filters by viewer.orgId.

/** Which thing a chain belongs to: exactly one of the two. */
export type ApprovalScope = { projectId: string; goalId?: undefined } | { goalId: string; projectId?: undefined };

const scopeWhere = (scope: ApprovalScope, table: typeof approvalSteps | typeof approvalBypass): SQL =>
  scope.goalId !== undefined ? eq(table.goalId, scope.goalId) : eq(table.projectId, scope.projectId);

/** The policy of a project or goal as lib/approvals/policy.ts reads it (null when the scope isn't set). */
export async function readPolicy(handle: Tx | typeof db, orgId: string, scope: ApprovalScope | null): Promise<ApprovalPolicy | null> {
  if (scope === null) return null;
  const [flag] =
    scope.goalId !== undefined
      ? await handle.select({ requiresApproval: goals.requiresApproval }).from(goals).where(and(eq(goals.id, scope.goalId), eq(goals.orgId, orgId)))
      : await handle.select({ requiresApproval: projects.requiresApproval }).from(projects).where(and(eq(projects.id, scope.projectId), eq(projects.orgId, orgId)));
  if (!flag) return null;
  const [steps, bypass] = await Promise.all([
    handle
      .select({ userId: approvalSteps.userId })
      .from(approvalSteps)
      .where(and(eq(approvalSteps.orgId, orgId), scopeWhere(scope, approvalSteps)))
      .orderBy(asc(approvalSteps.position)),
    handle
      .select({ userId: approvalBypass.userId })
      .from(approvalBypass)
      .where(and(eq(approvalBypass.orgId, orgId), scopeWhere(scope, approvalBypass))),
  ]);
  return { requiresApproval: flag.requiresApproval, steps, bypass: bypass.map((row) => row.userId) };
}

/** The settings dialog's view of a chain: who signs, in order, and who skips the queue. */
export type ApprovalSettings = {
  requiresApproval: boolean;
  steps: { id: string; user: Person | null }[];
  bypass: { id: string; user: Person }[];
};

const stepUser = alias(users, "step_user");

export async function approvalSettings(viewer: Viewer, scope: ApprovalScope): Promise<ApprovalSettings | null> {
  if (!canReadPlanning(viewer)) return null;
  const policy = await readPolicy(db, viewer.orgId, scope);
  if (policy === null) return null;
  const [steps, bypass] = await Promise.all([
    db
      .select({ id: approvalSteps.id, userId: stepUser.id, name: stepUser.name, email: stepUser.email, image: stepUser.image })
      .from(approvalSteps)
      .leftJoin(stepUser, eq(stepUser.id, approvalSteps.userId))
      .where(and(eq(approvalSteps.orgId, viewer.orgId), scopeWhere(scope, approvalSteps)))
      .orderBy(asc(approvalSteps.position)),
    db
      .select({ id: approvalBypass.id, userId: users.id, name: users.name, email: users.email, image: users.image })
      .from(approvalBypass)
      .innerJoin(users, eq(users.id, approvalBypass.userId))
      .where(and(eq(approvalBypass.orgId, viewer.orgId), scopeWhere(scope, approvalBypass)))
      .orderBy(asc(users.name)),
  ]);
  return {
    requiresApproval: policy.requiresApproval,
    steps: steps.map((row) => ({ id: row.id, user: row.userId ? { id: row.userId, name: row.name, email: row.email, image: row.image } : null })),
    bypass: bypass.map((row) => ({ id: row.id, user: { id: row.userId, name: row.name, email: row.email, image: row.image } })),
  };
}

/** Replaces a scope's chain and bypass list and sets its flag, inside the caller's transaction. People must be workers here. */
export async function saveApprovalSettings(
  tx: Tx,
  orgId: string,
  scope: ApprovalScope,
  settings: { requiresApproval: boolean; stepUserIds: string[]; bypassUserIds: string[] },
): Promise<void> {
  const wanted = [...new Set([...settings.stepUserIds, ...settings.bypassUserIds])];
  if (wanted.length > 0) {
    const workers = await tx
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.orgId, orgId), inArray(organizationMembers.userId, wanted), sql`${organizationMembers.role} <> 'stakeholder'`));
    if (workers.length !== wanted.length) throw new Error("Everyone in a sign-off chain must be a member who works in this workspace.");
  }
  await tx.delete(approvalSteps).where(and(eq(approvalSteps.orgId, orgId), scopeWhere(scope, approvalSteps)));
  await tx.delete(approvalBypass).where(and(eq(approvalBypass.orgId, orgId), scopeWhere(scope, approvalBypass)));
  const target = { orgId, projectId: scope.projectId ?? null, goalId: scope.goalId ?? null };
  const steps = [...new Set(settings.stepUserIds)];
  if (steps.length > 0) await tx.insert(approvalSteps).values(steps.map((userId, index) => ({ ...target, position: index + 1, userId })));
  const bypass = [...new Set(settings.bypassUserIds)];
  if (bypass.length > 0) await tx.insert(approvalBypass).values(bypass.map((userId) => ({ ...target, userId })));
  if (scope.goalId !== undefined) await tx.update(goals).set({ requiresApproval: settings.requiresApproval, updatedAt: new Date() }).where(eq(goals.id, scope.goalId));
  else await tx.update(projects).set({ requiresApproval: settings.requiresApproval, updatedAt: new Date() }).where(eq(projects.id, scope.projectId));
}

// --- a task's chain ---------------------------------------------------------------------------------------------------

/** The chain a proposal carries, locked for the rest of the transaction. */
export async function lockTaskApprovals(tx: Tx, taskId: string): Promise<(ApprovalStepState & { id: string })[]> {
  return tx
    .select({ id: taskApprovals.id, position: taskApprovals.position, userId: taskApprovals.userId, decision: taskApprovals.decision })
    .from(taskApprovals)
    .where(eq(taskApprovals.taskId, taskId))
    .orderBy(asc(taskApprovals.position))
    .for("update");
}

// --- the Proposals page -----------------------------------------------------------------------------------------------

/** One proposal as the Proposals page lists it. */
export type ProposalListItem = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  proposer: Person;
  project: { id: string; name: string } | null;
  goal: { id: string; title: string } | null;
  assignees: Person[];
  status: ProposalStatus;
  steps: ApprovalStepView[];
  /** The step that is up now, or null once the chain is settled. */
  current: ApprovalStepView | null;
  /** Whether the viewer may decide the current step. */
  canDecide: boolean;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
};

const proposer = alias(users, "proposer_user");

/**
 * Every proposal the viewer may see, newest first: all of them for workers, a stakeholder's own for a stakeholder.
 * Approved ones are kept for RECENTLY_DECIDED_DAYS days so a proposer sees that theirs went through.
 */
export async function listProposals(viewer: Viewer, options: { project?: string; recentDays?: number } = {}): Promise<ProposalListItem[]> {
  const recentDays = options.recentDays ?? 14;
  const where: (SQL | undefined)[] = [
    eq(tasks.orgId, viewer.orgId),
    projectCondition(options.project ?? ""),
    or(inArray(tasks.proposalStatus, ["pending", "declined"]), and(eq(tasks.proposalStatus, "approved"), sql`${tasks.updatedAt} > now() - make_interval(days => ${recentDays}::int)`)),
  ];
  if (viewer.orgRole === "stakeholder") where.push(eq(tasks.createdBy, viewer.userId));
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: sql<string | null>`left(${tasks.description}, 600)`,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      status: tasks.status,
      proposalStatus: tasks.proposalStatus,
      createdBy: tasks.createdBy,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      projectId: projects.id,
      projectName: projects.name,
      goalId: goals.id,
      goalTitle: goals.title,
      proposerId: proposer.id,
      proposerName: proposer.name,
      proposerEmail: proposer.email,
      proposerImage: proposer.image,
      assignees: assigneesJson,
      approvals: approvalsJson,
    })
    .from(tasks)
    .innerJoin(proposer, eq(proposer.id, tasks.createdBy))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(goals, eq(goals.id, tasks.goalId))
    .where(and(...where))
    .orderBy(desc(tasks.updatedAt))
    .limit(300);
  return rows.map((row) => {
    const steps = row.approvals.map((step) => ({ ...step, decidedAt: step.decidedAt ? new Date(step.decidedAt).toISOString() : null }));
    const states: ApprovalStepState[] = steps.map((step) => ({ position: step.position, userId: step.user?.id ?? null, decision: step.decision }));
    const current = row.proposalStatus === "pending" ? currentStep(steps.map((step) => ({ ...step, userId: step.user?.id ?? null }))) : null;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      dueDate: row.dueDate,
      proposer: { id: row.proposerId, name: row.proposerName, email: row.proposerEmail, image: row.proposerImage },
      project: row.projectId && row.projectName ? { id: row.projectId, name: row.projectName } : null,
      goal: row.goalId && row.goalTitle ? { id: row.goalId, title: row.goalTitle } : null,
      assignees: row.assignees,
      status: row.proposalStatus ?? "approved",
      steps,
      current,
      canDecide: row.proposalStatus === "pending" && canDecideProposal(viewer, states),
      isMine: row.createdBy === viewer.userId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

/** How many proposals wait for this viewer's sign-off right now (Home's panel, the nav). */
export async function countProposalsWaitingFor(viewer: Viewer, project = ""): Promise<number> {
  if (viewer.orgRole === "stakeholder") return 0;
  const pending = await listProposals(viewer, { project, recentDays: 0 });
  return pending.filter((item) => item.status === "pending" && item.canDecide).length;
}

/** The pending proposals in scope, oldest first: what Reports counts among decisions waiting. */
export async function pendingProposals(viewer: Viewer, project = ""): Promise<ProposalListItem[]> {
  const items = await listProposals(viewer, { project, recentDays: 0 });
  return items.filter((item) => item.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Pending proposals whose current step names nobody in particular are "any leader's": used by notices. */
export const isAnyLeaderStep = (step: { userId: string | null } | null) => step !== null && step.userId === null;

/** The goals of one project whose chain a form may need, with their policy flag (the project page's settings list). */
export async function goalsRequiringApproval(viewer: Viewer, projectId: string): Promise<{ id: string; title: string }[]> {
  if (!canReadPlanning(viewer)) return [];
  return db
    .select({ id: goals.id, title: goals.title })
    .from(goals)
    .where(and(eq(goals.orgId, viewer.orgId), eq(goals.projectId, projectId), eq(goals.requiresApproval, true), isNull(goals.parentGoalId)))
    .orderBy(asc(goals.title));
}
