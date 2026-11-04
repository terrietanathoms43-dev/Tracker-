import { describe, expect, it } from "vitest";
import type { Viewer } from "@/lib/permissions";
import { canDecideProposal, canDecideStep, chainFor, currentStep, policyInForce } from "./policy";

// Who signs off a new task, in what order (docs/PLAN.md, 2026-11-03 log).

const viewer = (orgRole: Viewer["orgRole"], userId = "u"): Viewer => ({ userId, orgId: "org", orgRole, timezone: "UTC" });
const policy = (steps: (string | null)[], bypass: string[] = [], requiresApproval = true) => ({ requiresApproval, steps: steps.map((userId) => ({ userIds: userId === null ? [] : [userId] })), bypass });

describe("chainFor", () => {
  it("a member's task in a plain project goes live at once", () => {
    expect(chainFor({ creatorId: "jordan", creatorRole: "member", goal: null, project: policy([], [], false) })).toBeNull();
    expect(chainFor({ creatorId: "jordan", creatorRole: "member", goal: null, project: null })).toBeNull();
  });
  it("a stakeholder's task always waits for a leader or admin", () => {
    expect(chainFor({ creatorId: "taylor", creatorRole: "stakeholder", goal: null, project: null })).toEqual([{ position: 1, userIds: [], autoSigned: false }]);
  });
  it("an approve-only project hands out its chain in order", () => {
    expect(chainFor({ creatorId: "sam", creatorRole: "member", goal: null, project: policy(["terri", "max"]) })).toEqual([
      { position: 1, userIds: ["terri"], autoSigned: false },
      { position: 2, userIds: ["max"], autoSigned: false },
    ]);
  });
  it("someone on the bypass list skips the queue", () => {
    expect(chainFor({ creatorId: "jordan", creatorRole: "member", goal: null, project: policy(["terri"], ["jordan"]) })).toBeNull();
  });
  it("a chain with no names means any leader or admin", () => {
    expect(chainFor({ creatorId: "sam", creatorRole: "member", goal: null, project: policy([]) })).toEqual([{ position: 1, userIds: [], autoSigned: false }]);
  });
  it("the goal's rule wins over the project's", () => {
    expect(chainFor({ creatorId: "sam", creatorRole: "member", goal: policy(["avery"]), project: policy(["terri", "max"]) })).toEqual([{ position: 1, userIds: ["avery"], autoSigned: false }]);
    expect(policyInForce(policy([], [], false), policy(["terri"]))).toEqual(policy(["terri"]));
  });
  it("a step naming the proposer is signed as it is made; a chain that is only them is no chain", () => {
    expect(chainFor({ creatorId: "terri", creatorRole: "leader", goal: null, project: policy(["terri", "max"]) })).toEqual([
      { position: 1, userIds: ["terri"], autoSigned: true },
      { position: 2, userIds: ["max"], autoSigned: false },
    ]);
    expect(chainFor({ creatorId: "terri", creatorRole: "leader", goal: null, project: policy(["terri"]) })).toBeNull();
  });
});

describe("deciding a step", () => {
  const steps = [
    { position: 1, userIds: ["terri"], decision: "approved" as const },
    { position: 2, userIds: ["max"], decision: null },
  ];
  it("the first undecided step is the one that is up", () => {
    expect(currentStep(steps)?.position).toBe(2);
    expect(currentStep([{ position: 1, userIds: [], decision: "approved" as const }])).toBeNull();
  });
  it("the named person, or an admin, may decide it; nobody else", () => {
    expect(canDecideProposal(viewer("member", "max"), steps)).toBe(true);
    expect(canDecideProposal(viewer("admin", "avery"), steps)).toBe(true);
    expect(canDecideProposal(viewer("leader", "morgan"), steps)).toBe(false);
    expect(canDecideProposal(viewer("stakeholder", "max"), steps)).toBe(false);
  });
  it("a step naming nobody is any leader's or admin's", () => {
    expect(canDecideStep(viewer("leader", "morgan"), { userIds: [] })).toBe(true);
    expect(canDecideStep(viewer("member", "jordan"), { userIds: [] })).toBe(false);
  });
});

describe("a step naming several people", () => {
  it("is signed by any one of them, and is auto-signed when the proposer is among them", () => {
    const group = { requiresApproval: true, steps: [{ userIds: ["max", "terri"] }, { userIds: ["avery"] }], bypass: [] };
    expect(canDecideStep(viewer("member", "terri"), { userIds: ["max", "terri"] })).toBe(true);
    expect(canDecideStep(viewer("member", "jordan"), { userIds: ["max", "terri"] })).toBe(false);
    expect(chainFor({ creatorId: "max", creatorRole: "member", goal: null, project: group })).toEqual([
      { position: 1, userIds: ["max", "terri"], autoSigned: true },
      { position: 2, userIds: ["avery"], autoSigned: false },
    ]);
  });
});
