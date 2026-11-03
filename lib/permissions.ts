import { ORG_ROLES, type OrgRole, type ProposalStatus } from "@/lib/constants";

/**
 * Who may do what (docs/PLAN.md §3, 2026-11-03 log). Pure predicates over a Viewer and the scope of a resource,
 * with no I/O, so every DAL query, every action and the UI can call them, and they can be unit-tested in isolation.
 *
 * Every predicate that takes a resource checks the workspace first: an id that belongs to another
 * workspace is simply not visible, whatever the role.
 */
export type Viewer = {
  userId: string;
  orgId: string;
  orgRole: OrgRole;
  timezone: string;
};

type OrgScoped = { orgId: string };

export type TaskScope = OrgScoped & {
  /** The people assigned. */
  assigneeIds: string[];
  createdBy: string;
  approverId?: string | null;
  /** Null for a task that was live from the start; pending / declined proposals are not yet work. */
  proposalStatus?: ProposalStatus | null;
};

export const inOrg = (viewer: Viewer, resource: OrgScoped) => viewer.orgId === resource.orgId;
export const isAdmin = (viewer: Viewer) => viewer.orgRole === "admin";
/** Leaders and admins: the people who manage work and decide. */
export const isLeader = (viewer: Viewer) => viewer.orgRole === "leader" || isAdmin(viewer);
export const isStakeholder = (viewer: Viewer) => viewer.orgRole === "stakeholder";
/** Admins, leaders and members: everyone who does work in the workspace. */
export const isWorker = (viewer: Viewer) => !isStakeholder(viewer);

/** A task that is work, not a proposal still waiting for (or refused) sign-off. */
export const isLive = (task: Pick<TaskScope, "proposalStatus">) => task.proposalStatus == null || task.proposalStatus === "approved";

/** A proposal still in the proposer's hands: waiting, or declined and editable. */
export const isOpenProposal = (task: Pick<TaskScope, "proposalStatus">) => task.proposalStatus === "pending" || task.proposalStatus === "declined";

// --- tasks ------------------------------------------------------------------

/** Assigned to the task. */
export function isAssigned(viewer: Pick<Viewer, "userId">, task: Pick<TaskScope, "assigneeIds">): boolean {
  return task.assigneeIds.includes(viewer.userId);
}

/** Everyone in the workspace reads its tasks; a stakeholder reads them to follow goals and their own proposals. */
export function canReadTask(viewer: Viewer, task: TaskScope): boolean {
  return inOrg(viewer, task);
}

/** Anyone in the workspace may add a task; a stakeholder's is always a proposal (lib/approvals/policy.ts). */
export const canCreateTask = (viewer: Viewer) => viewer.orgId.length > 0;

/**
 * Editing fields and assigning: leaders, anyone assigned, or whoever created it. A stakeholder may only edit a
 * proposal of their own that is still open.
 */
export function canEditTask(viewer: Viewer, task: TaskScope): boolean {
  if (!inOrg(viewer, task)) return false;
  if (isStakeholder(viewer)) return task.createdBy === viewer.userId && isOpenProposal(task);
  return isLeader(viewer) || isAssigned(viewer, task) || task.createdBy === viewer.userId;
}

/** Progress, comments and status changes: any worker in the workspace, once the task is live. */
export function canUpdateProgress(viewer: Viewer, task: TaskScope): boolean {
  return inOrg(viewer, task) && isWorker(viewer) && isLive(task);
}

/** Marking a comment resolved (or open again): anyone who may work on the task. */
export const canResolveComment = canUpdateProgress;

/** Approve or send back: the named approver, or any leader. */
export function canApproveTask(viewer: Viewer, task: TaskScope): boolean {
  if (!inOrg(viewer, task) || isStakeholder(viewer) || !isLive(task)) return false;
  return (task.approverId != null && task.approverId === viewer.userId) || isLeader(viewer);
}

/** Rejecting is an edit right, and never a stakeholder's. */
export function canRejectTask(viewer: Viewer, task: TaskScope): boolean {
  return isWorker(viewer) && canEditTask(viewer, task) && isLive(task);
}

/** Deleting destroys the task and its history: leaders and admins; a proposer may withdraw their own open proposal. */
export function canDeleteTask(viewer: Viewer, task?: Pick<TaskScope, "createdBy" | "proposalStatus">): boolean {
  if (isLeader(viewer)) return true;
  return task !== undefined && task.createdBy === viewer.userId && isOpenProposal(task);
}

// --- projects and goals ---------------------------------------------------------

/** Everyone in the workspace reads its projects and goals; a stakeholder needs them to sign goals off. */
export const canReadPlanning = (viewer: Viewer) => viewer.orgId.length > 0;
export const canManagePlanning = (viewer: Viewer) => isLeader(viewer);

/** Marking a goal completed (or open again): admins, leaders and stakeholders. Members never sign a goal off. */
export const canCompleteGoal = (viewer: Viewer) => isLeader(viewer) || isStakeholder(viewer);

/** The sign-off chain and bypass list of a project or goal, and the links between goals: whoever manages planning. */
export const canManageApprovals = canManagePlanning;
export const canLinkGoals = canManagePlanning;

/** Turning a meeting transcript into goals and tasks (and a project): it creates planning, so leaders and admins. */
export const canCapture = (viewer: Viewer) => isLeader(viewer);

// --- members, reports, administration ------------------------------------------

/** The Members page (the roster) is for the people who do the work; a stakeholder reads the roster under Settings. */
export const canSeeMembers = (viewer: Viewer) => isWorker(viewer);
export const canSeeReports = (viewer: Viewer) => isWorker(viewer);
export const canManageOrg = (viewer: Viewer) => isAdmin(viewer);

/** Admins invite anyone; leaders invite members and stakeholders, never another admin. */
export function canInvite(viewer: Viewer, role: OrgRole): boolean {
  if (isAdmin(viewer)) return true;
  return isLeader(viewer) && role !== "admin";
}

/** The roles a viewer may offer in an invitation form, in the order the pickers show them. */
export function invitableRoles(viewer: Viewer): OrgRole[] {
  return ORG_ROLES.filter((role) => canInvite(viewer, role));
}

/** Resend, renew and revoke an invitation: any admin, or the leader who sent it. */
export function canManageInvitation(viewer: Viewer, invitedBy: string | null): boolean {
  return isAdmin(viewer) || (isLeader(viewer) && invitedBy === viewer.userId);
}

// --- navigation ---------------------------------------------------------------

export type NavKey = "home" | "my-work" | "tasks" | "goals" | "members" | "proposals" | "reports";

/**
 * What the navigation shows: a stakeholder gets the front door, the goals they sign off and the proposals they
 * make; everyone else the lot. The tasks views are reached through the /home tab row, so there is no Tasks item.
 */
export function navFor(viewer: Pick<Viewer, "orgRole">): NavKey[] {
  if (viewer.orgRole === "stakeholder") return ["home", "goals", "proposals"];
  return ["home", "my-work", "goals", "members", "proposals", "reports"];
}
