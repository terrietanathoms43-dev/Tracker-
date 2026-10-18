import { ORG_ROLES, type OrgRole } from "@/lib/constants";

/**
 * Who may do what (docs/PLAN.md §3). Pure predicates over a Viewer and the scope of a resource, with no
 * I/O, so every DAL query, every action and the UI can call them, and they can be unit-tested in isolation.
 *
 * Every predicate that takes a resource checks the workspace first: an id that belongs to another
 * workspace is simply not visible, whatever the role.
 */
export type Viewer = {
  userId: string;
  orgId: string;
  orgRole: OrgRole;
  /** The teams the viewer is in, in this workspace (lib/viewer.ts), so "assigned through a team" is a pure check. */
  teamIds: string[];
  timezone: string;
};

type OrgScoped = { orgId: string };

export type TaskScope = OrgScoped & {
  /** The people assigned directly. */
  assigneeIds: string[];
  /** The teams assigned; everyone in them counts as assigned. */
  teamIds: string[];
  createdBy: string;
  approverId?: string | null;
  /** Requester of the request the task was converted from, if any. */
  requesterId?: string | null;
};

export type RequestScope = OrgScoped & { requesterId: string };

export const inOrg = (viewer: Viewer, resource: OrgScoped) => viewer.orgId === resource.orgId;
export const isAdmin = (viewer: Viewer) => viewer.orgRole === "admin";
/** Leaders and admins: the people who manage work and decide. */
export const isLeader = (viewer: Viewer) => viewer.orgRole === "leader" || isAdmin(viewer);
export const isStakeholder = (viewer: Viewer) => viewer.orgRole === "stakeholder";
/** Admins, leaders and members: everyone who does work in the workspace. */
export const isWorker = (viewer: Viewer) => !isStakeholder(viewer);

// --- tasks ------------------------------------------------------------------

/** Assigned to the task directly, or through one of the viewer's teams. */
export function isAssigned(viewer: Pick<Viewer, "userId" | "teamIds">, task: Pick<TaskScope, "assigneeIds" | "teamIds">): boolean {
  return task.assigneeIds.includes(viewer.userId) || task.teamIds.some((teamId) => viewer.teamIds.includes(teamId));
}

/** Workers read every task; a stakeholder only the tasks created from their own requests. */
export function canReadTask(viewer: Viewer, task: TaskScope): boolean {
  if (!inOrg(viewer, task)) return false;
  if (isStakeholder(viewer)) return task.requesterId != null && task.requesterId === viewer.userId;
  return true;
}

export const canCreateTask = (viewer: Viewer) => isWorker(viewer);

/** Editing fields, assigning and rejecting: leaders, anyone assigned (directly or through a team), or whoever created it. */
export function canEditTask(viewer: Viewer, task: TaskScope): boolean {
  if (!inOrg(viewer, task) || isStakeholder(viewer)) return false;
  return isLeader(viewer) || isAssigned(viewer, task) || task.createdBy === viewer.userId;
}

/** Progress, comments and quick status changes: any worker in the workspace. */
export function canUpdateProgress(viewer: Viewer, task: TaskScope): boolean {
  return inOrg(viewer, task) && isWorker(viewer);
}

/** Approve or send back: the named approver, or any leader. */
export function canApproveTask(viewer: Viewer, task: TaskScope): boolean {
  if (!inOrg(viewer, task) || isStakeholder(viewer)) return false;
  return (task.approverId != null && task.approverId === viewer.userId) || isLeader(viewer);
}

export const canRejectTask = canEditTask;

// --- projects and goals ---------------------------------------------------------

export const canReadPlanning = (viewer: Viewer) => isWorker(viewer);
export const canManagePlanning = (viewer: Viewer) => isLeader(viewer);

// --- requests -------------------------------------------------------------------

export function canReadRequest(viewer: Viewer, request: RequestScope): boolean {
  if (!inOrg(viewer, request)) return false;
  return isWorker(viewer) || request.requesterId === viewer.userId;
}

/** Anyone in the workspace may ask for something, stakeholders included; having a Viewer is being in the workspace. */
export const canSubmitRequest = (viewer: Viewer) => viewer.orgId.length > 0;

export const canDecideRequest = (viewer: Viewer) => isLeader(viewer);

// --- members, teams, reports, administration ------------------------------------

/** The Members page (roster and teams) is for the people who do the work; a stakeholder reads the roster under Settings. */
export const canSeeMembers = (viewer: Viewer) => isWorker(viewer);
/** Creating teams and changing their names and members: leaders and admins (docs/PLAN.md, 2026-10-18 log). */
export const canManageTeams = (viewer: Viewer) => isLeader(viewer);
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

export type NavKey = "home" | "my-work" | "tasks" | "goals" | "members" | "requests";

/** What the navigation shows: stakeholders get the front door and requests, everyone else the lot. */
export function navFor(viewer: Pick<Viewer, "orgRole">): NavKey[] {
  if (viewer.orgRole === "stakeholder") return ["home", "requests"];
  return ["home", "my-work", "tasks", "goals", "members", "requests"];
}
