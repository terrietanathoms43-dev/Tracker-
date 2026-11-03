import type { ApprovalDecision, OrgRole } from "@/lib/constants";
import { isAdmin, isLeader, isStakeholder, type Viewer } from "@/lib/permissions";

// Proposals (docs/PLAN.md, 2026-11-03 log): which new tasks wait for sign-off, by whom, in what order. Pure, so
// the create action, the Proposals page and the task page's banner all agree, and the rules are unit-tested.

/** What a project or a goal says about new tasks: whether they wait, who signs (in order), who skips the queue. */
export type ApprovalPolicy = {
  requiresApproval: boolean;
  /** The chain, in order; a null user means any leader or admin. */
  steps: { userId: string | null }[];
  bypass: string[];
};

/** One step of the chain a new proposal gets; `autoSigned` when the step names the proposer themselves. */
export type ChainStep = { position: number; userId: string | null; autoSigned: boolean };

/** A step as the task carries it. */
export type ApprovalStepState = { position: number; userId: string | null; decision: ApprovalDecision | null };

/** A goal's policy wins over its project's when the goal asks for approval. */
export function policyInForce(goal: ApprovalPolicy | null, project: ApprovalPolicy | null): ApprovalPolicy | null {
  if (goal?.requiresApproval) return goal;
  if (project?.requiresApproval) return project;
  return null;
}

/**
 * The chain a new task must pass, or null when it goes live at once. A stakeholder's task always waits (for any
 * leader or admin when nothing more specific is set); anyone on the scope's bypass list skips the queue; steps that
 * name the proposer are signed as they are made.
 */
export function chainFor(input: { creatorId: string; creatorRole: OrgRole; goal: ApprovalPolicy | null; project: ApprovalPolicy | null }): ChainStep[] | null {
  const policy = policyInForce(input.goal, input.project);
  if (policy !== null && policy.bypass.includes(input.creatorId)) return null;
  const stakeholder = input.creatorRole === "stakeholder";
  if (policy === null && !stakeholder) return null;
  const named = policy?.steps.length ? policy.steps : [{ userId: null }];
  const chain = named.map((step, index) => ({ position: index + 1, userId: step.userId, autoSigned: step.userId !== null && step.userId === input.creatorId }));
  return chain.every((step) => step.autoSigned) ? null : chain;
}

/** The step that is up now: the first one nobody has decided. */
export function currentStep<T extends ApprovalStepState>(steps: T[]): T | null {
  return [...steps].sort((a, b) => a.position - b.position).find((step) => step.decision === null) ?? null;
}

/** Whether the viewer may decide a step: the person it names, any admin, or any leader when it names nobody. */
export function canDecideStep(viewer: Viewer, step: { userId: string | null }): boolean {
  if (isStakeholder(viewer)) return false;
  if (isAdmin(viewer)) return true;
  if (step.userId === null) return isLeader(viewer);
  return step.userId === viewer.userId;
}

/** Whether the viewer may decide the proposal's current step. */
export function canDecideProposal(viewer: Viewer, steps: ApprovalStepState[]): boolean {
  const step = currentStep(steps);
  return step !== null && canDecideStep(viewer, step);
}
