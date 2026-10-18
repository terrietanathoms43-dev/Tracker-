// The decision rules every entry point shares, and how the history phrases them.
import { describe, expect, it } from "vitest";
import { REQUEST_DECISIONS, REQUEST_STATUSES } from "@/lib/constants";
import { decisionProblem, decisionsFor, phraseDecisions, STATUS_AFTER } from "./decisions";
import type { RequestDecisionItem } from "./types";

const morgan = { id: "u-m", name: "Morgan Lead", email: "morgan@trackwise.test", image: null };
const row = (id: string, decision: RequestDecisionItem["decision"], reason: string | null = null): RequestDecisionItem => ({
  id,
  decision,
  reason,
  decider: morgan,
  at: "2026-10-10T12:00:00.000Z",
});

describe("request decisions", () => {
  it("offers exactly the decisions each status allows, and refuses the rest with a reason", () => {
    for (const status of REQUEST_STATUSES) {
      for (const decision of REQUEST_DECISIONS) {
        const allowed = decisionsFor(status).includes(decision);
        expect(decisionProblem(status, decision) === null).toBe(allowed);
      }
    }
  });

  it("converts only approved requests directly, and never decides a converted one again", () => {
    expect(decisionsFor("approved")).toContain("converted");
    expect(decisionProblem("new", "converted")).toMatch(/Approve the request/);
    expect(decisionsFor("converted")).toEqual([]);
    expect(decisionProblem("converted", "reopened")).toMatch(/already a task/);
  });

  it("reopens only deferred or rejected requests, back to new", () => {
    expect(decisionsFor("deferred")).toContain("reopened");
    expect(decisionsFor("rejected")).toEqual(["reopened"]);
    expect(decisionProblem("approved", "reopened")).toMatch(/Only a deferred or rejected/);
    expect(STATUS_AFTER.reopened).toBe("new");
  });

  it("names the revisit date only on the deferral still in force", () => {
    const decisions = [row("d2", "deferred", "waiting on budget"), row("d1", "deferred")];
    const phrased = phraseDecisions(decisions, { status: "deferred", deferUntil: "2026-10-30" }, "2026-10-17");
    expect(phrased.map((each) => each.verb)).toEqual(["deferred it until Oct 30", "deferred it"]);
    expect(phraseDecisions([row("r", "reopened"), ...decisions], { status: "new", deferUntil: null }, "2026-10-17").map((each) => each.verb)).toEqual([
      "reopened it",
      "deferred it",
      "deferred it",
    ]);
  });
});
