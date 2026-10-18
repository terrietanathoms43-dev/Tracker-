import { describe, expect, it } from "vitest";
import type { OrgRole } from "@/lib/constants";
import {
  canApproveTask,
  canDecideRequest,
  canEditTask,
  canInvite,
  canManageInvitation,
  canManageOrg,
  canManagePlanning,
  canManageTeams,
  canReadRequest,
  canReadTask,
  canSeeMembers,
  canUpdateProgress,
  invitableRoles,
  isAssigned,
  navFor,
  type TaskScope,
  type Viewer,
} from "./permissions";

const viewer = (orgRole: OrgRole, userId = "u1", orgId = "org1", teamIds: string[] = []): Viewer => ({ userId, orgId, orgRole, teamIds, timezone: "UTC" });

const task = (overrides: Partial<TaskScope> = {}): TaskScope => ({
  orgId: "org1",
  assigneeIds: ["u2"],
  teamIds: [],
  createdBy: "u3",
  approverId: null,
  requesterId: null,
  ...overrides,
});

describe("workspace boundary", () => {
  it("hides everything in another workspace, whatever the role", () => {
    const admin = viewer("admin", "u1", "other");
    expect(canReadTask(admin, task())).toBe(false);
    expect(canEditTask(admin, task())).toBe(false);
    expect(canApproveTask(admin, task())).toBe(false);
    expect(canReadRequest(admin, { orgId: "org1", requesterId: "u1" })).toBe(false);
  });
});

describe("tasks", () => {
  it("lets every worker read, and a stakeholder only their own converted tasks", () => {
    expect(canReadTask(viewer("member"), task())).toBe(true);
    expect(canReadTask(viewer("stakeholder"), task())).toBe(false);
    expect(canReadTask(viewer("stakeholder"), task({ requesterId: "u1" }))).toBe(true);
  });

  it("counts someone as assigned directly or through one of their teams", () => {
    expect(isAssigned(viewer("member"), task({ assigneeIds: ["u1", "u2"] }))).toBe(true);
    expect(isAssigned(viewer("member"), task({ assigneeIds: [], teamIds: ["frontend"] }))).toBe(false);
    expect(isAssigned(viewer("member", "u1", "org1", ["frontend"]), task({ assigneeIds: [], teamIds: ["frontend"] }))).toBe(true);
    expect(isAssigned(viewer("member", "u1", "org1", ["platform"]), task({ assigneeIds: [], teamIds: ["frontend"] }))).toBe(false);
  });

  it("limits editing to leaders, the people and teams assigned, and the creator", () => {
    expect(canEditTask(viewer("leader"), task())).toBe(true);
    expect(canEditTask(viewer("admin"), task())).toBe(true);
    expect(canEditTask(viewer("member"), task())).toBe(false);
    expect(canEditTask(viewer("member"), task({ assigneeIds: ["u2", "u1"] }))).toBe(true);
    expect(canEditTask(viewer("member", "u1", "org1", ["frontend"]), task({ teamIds: ["frontend"] }))).toBe(true);
    expect(canEditTask(viewer("member"), task({ createdBy: "u1" }))).toBe(true);
    expect(canEditTask(viewer("stakeholder"), task({ assigneeIds: ["u1"] }))).toBe(false);
  });

  it("lets any worker add progress", () => {
    expect(canUpdateProgress(viewer("member"), task())).toBe(true);
    expect(canUpdateProgress(viewer("stakeholder"), task())).toBe(false);
  });

  it("reserves approval for the approver and leaders", () => {
    expect(canApproveTask(viewer("member"), task())).toBe(false);
    expect(canApproveTask(viewer("member"), task({ approverId: "u1" }))).toBe(true);
    expect(canApproveTask(viewer("leader"), task())).toBe(true);
  });
});

describe("planning, requests, administration", () => {
  it("lets leaders manage projects, goals, teams and request decisions", () => {
    for (const role of ["leader", "admin"] as const) {
      expect(canManagePlanning(viewer(role))).toBe(true);
      expect(canDecideRequest(viewer(role))).toBe(true);
      expect(canManageTeams(viewer(role))).toBe(true);
    }
    for (const role of ["member", "stakeholder"] as const) {
      expect(canManagePlanning(viewer(role))).toBe(false);
      expect(canDecideRequest(viewer(role))).toBe(false);
      expect(canManageTeams(viewer(role))).toBe(false);
    }
  });

  it("opens the Members page to everyone who does work", () => {
    expect(canSeeMembers(viewer("member"))).toBe(true);
    expect(canSeeMembers(viewer("stakeholder"))).toBe(false);
  });

  it("shows a stakeholder only their own requests", () => {
    expect(canReadRequest(viewer("stakeholder"), { orgId: "org1", requesterId: "u1" })).toBe(true);
    expect(canReadRequest(viewer("stakeholder"), { orgId: "org1", requesterId: "u9" })).toBe(false);
    expect(canReadRequest(viewer("member"), { orgId: "org1", requesterId: "u9" })).toBe(true);
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
  it("gives stakeholders two destinations and everyone else six, Members among them", () => {
    expect(navFor({ orgRole: "stakeholder" })).toEqual(["home", "requests"]);
    expect(navFor({ orgRole: "member" })).toEqual(["home", "my-work", "tasks", "goals", "members", "requests"]);
  });
});
