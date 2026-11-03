import { describe, expect, it } from "vitest";
import type { OrgRole } from "@/lib/constants";
import {
  canApproveTask,
  canCapture,
  canCompleteGoal,
  canCreateTask,
  canDeleteTask,
  canEditTask,
  canInvite,
  canManageApprovals,
  canManageInvitation,
  canManageOrg,
  canManagePlanning,
  canReadPlanning,
  canReadTask,
  canRejectTask,
  canResolveComment,
  canSeeMembers,
  canSeeReports,
  canUpdateProgress,
  invitableRoles,
  isAssigned,
  navFor,
  type TaskScope,
  type Viewer,
} from "./permissions";

const viewer = (orgRole: OrgRole, userId = "u1", orgId = "org1"): Viewer => ({ userId, orgId, orgRole, timezone: "UTC" });

const task = (overrides: Partial<TaskScope> = {}): TaskScope => ({
  orgId: "org1",
  assigneeIds: ["u2"],
  createdBy: "u3",
  approverId: null,
  proposalStatus: null,
  ...overrides,
});

describe("workspace boundary", () => {
  it("hides everything in another workspace, whatever the role", () => {
    const admin = viewer("admin", "u1", "other");
    expect(canReadTask(admin, task())).toBe(false);
    expect(canEditTask(admin, task())).toBe(false);
    expect(canApproveTask(admin, task())).toBe(false);
  });
});

describe("tasks", () => {
  it("lets everyone in the workspace read, stakeholders included", () => {
    expect(canReadTask(viewer("member"), task())).toBe(true);
    expect(canReadTask(viewer("stakeholder"), task())).toBe(true);
  });

  it("lets everyone add a task (a stakeholder's becomes a proposal)", () => {
    expect(canCreateTask(viewer("stakeholder"))).toBe(true);
    expect(canCreateTask(viewer("member"))).toBe(true);
  });

  it("counts someone as assigned when they are on the task", () => {
    expect(isAssigned(viewer("member"), task({ assigneeIds: ["u1", "u2"] }))).toBe(true);
    expect(isAssigned(viewer("member"), task({ assigneeIds: ["u2"] }))).toBe(false);
  });

  it("limits editing to leaders, the people assigned, and the creator", () => {
    expect(canEditTask(viewer("leader"), task())).toBe(true);
    expect(canEditTask(viewer("admin"), task())).toBe(true);
    expect(canEditTask(viewer("member"), task())).toBe(false);
    expect(canEditTask(viewer("member"), task({ assigneeIds: ["u2", "u1"] }))).toBe(true);
    expect(canEditTask(viewer("member"), task({ createdBy: "u1" }))).toBe(true);
    expect(canEditTask(viewer("stakeholder"), task({ assigneeIds: ["u1"] }))).toBe(false);
  });

  it("lets a stakeholder edit or withdraw only their own open proposal", () => {
    const mine = task({ createdBy: "u1", proposalStatus: "pending" });
    expect(canEditTask(viewer("stakeholder"), mine)).toBe(true);
    expect(canDeleteTask(viewer("stakeholder"), mine)).toBe(true);
    expect(canEditTask(viewer("stakeholder"), task({ createdBy: "u1", proposalStatus: "approved" }))).toBe(false);
    expect(canDeleteTask(viewer("member"), task({ createdBy: "u1", proposalStatus: "declined" }))).toBe(true);
    expect(canDeleteTask(viewer("member"), task({ createdBy: "u1" }))).toBe(false);
    expect(canDeleteTask(viewer("leader"))).toBe(true);
  });

  it("lets any worker add progress and resolve comments, once the task is live", () => {
    expect(canUpdateProgress(viewer("member"), task())).toBe(true);
    expect(canResolveComment(viewer("member"), task())).toBe(true);
    expect(canUpdateProgress(viewer("member"), task({ proposalStatus: "approved" }))).toBe(true);
    expect(canUpdateProgress(viewer("member"), task({ proposalStatus: "pending" }))).toBe(false);
    expect(canUpdateProgress(viewer("stakeholder"), task())).toBe(false);
    expect(canResolveComment(viewer("stakeholder"), task())).toBe(false);
  });

  it("reserves approval for the approver and leaders, and rejection for workers who may edit", () => {
    expect(canApproveTask(viewer("member"), task())).toBe(false);
    expect(canApproveTask(viewer("member"), task({ approverId: "u1" }))).toBe(true);
    expect(canApproveTask(viewer("leader"), task())).toBe(true);
    expect(canApproveTask(viewer("leader"), task({ proposalStatus: "pending" }))).toBe(false);
    expect(canRejectTask(viewer("stakeholder"), task({ createdBy: "u1", proposalStatus: "pending" }))).toBe(false);
    expect(canRejectTask(viewer("leader"), task())).toBe(true);
  });
});

describe("planning, approvals, administration", () => {
  it("lets leaders manage projects, goals, sign-off chains and goal links", () => {
    for (const role of ["leader", "admin"] as const) {
      expect(canManagePlanning(viewer(role))).toBe(true);
      expect(canManageApprovals(viewer(role))).toBe(true);
    }
    for (const role of ["member", "stakeholder"] as const) {
      expect(canManagePlanning(viewer(role))).toBe(false);
      expect(canManageApprovals(viewer(role))).toBe(false);
    }
  });

  it("lets everyone read projects and goals, and only admins, leaders and stakeholders complete a goal", () => {
    for (const role of ["admin", "leader", "member", "stakeholder"] as const) expect(canReadPlanning(viewer(role))).toBe(true);
    for (const role of ["admin", "leader", "stakeholder"] as const) expect(canCompleteGoal(viewer(role))).toBe(true);
    expect(canCompleteGoal(viewer("member"))).toBe(false);
  });

  it("opens the Members page and Reports to everyone who does work", () => {
    expect(canSeeMembers(viewer("member"))).toBe(true);
    expect(canSeeReports(viewer("member"))).toBe(true);
    expect(canSeeMembers(viewer("stakeholder"))).toBe(false);
    expect(canSeeReports(viewer("stakeholder"))).toBe(false);
  });

  it("keeps workspace administration to admins", () => {
    expect(canManageOrg(viewer("admin"))).toBe(true);
    expect(canManageOrg(viewer("leader"))).toBe(false);
  });

  it("lets leaders invite everyone but admins, and only admins or the inviter manage an invitation", () => {
    expect(invitableRoles(viewer("admin"))).toEqual(["admin", "leader", "member", "stakeholder"]);
    expect(invitableRoles(viewer("leader"))).toEqual(["leader", "member", "stakeholder"]);
    expect(invitableRoles(viewer("member"))).toEqual([]);
    expect(canInvite(viewer("leader"), "admin")).toBe(false);
    expect(canManageInvitation(viewer("leader", "u1"), "u1")).toBe(true);
    expect(canManageInvitation(viewer("leader", "u1"), "u9")).toBe(false);
    expect(canManageInvitation(viewer("admin"), "u9")).toBe(true);
  });
});

describe("navigation", () => {
  it("gives stakeholders three destinations and everyone else six, Reports last", () => {
    expect(navFor({ orgRole: "stakeholder" })).toEqual(["home", "goals", "proposals"]);
    expect(navFor({ orgRole: "member" })).toEqual(["home", "my-work", "goals", "members", "proposals", "reports"]);
  });
});

describe("canCapture", () => {
  it("lets leaders and admins turn a meeting into goals and tasks, nobody else", () => {
    for (const role of ["admin", "leader"] as const) expect(canCapture(viewer(role))).toBe(true);
    for (const role of ["member", "stakeholder"] as const) expect(canCapture(viewer(role))).toBe(false);
  });
});
