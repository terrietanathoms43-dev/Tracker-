import { describe, expect, it } from "vitest";
import type { CaptureContext } from "./draft";
import { fakeProposal } from "./fake";
import { proposalToDraft } from "./prompt";

const context: CaptureContext = {
  today: "2026-11-01", // a Sunday
  timezone: "America/Jamaica",
  people: [
    { id: "u-jordan", name: "Jordan Dev", email: "jordan@trackwise.test", image: null },
    { id: "u-sam", name: "Sam Dev", email: "sam@trackwise.test", image: null },
    { id: "u-morgan", name: "Morgan Lead", email: "morgan@trackwise.test", image: null },
  ],
  projects: [{ id: "p-incidents", name: "Incident tooling", goal: { id: "g-incidents", title: "Cut incident response time in half" } }],
  goals: [
    { id: "g-incidents", title: "Cut incident response time in half", parentGoalId: null, targetDate: "2027-01-10" },
    { id: "g-invites", title: "Invitations work without a support call", parentGoalId: "g-onboarding", targetDate: "2026-12-01" },
  ],
  defaultProjectId: "",
};

const notes = `Meeting: Incident review, 1 Nov
Project: Incident tooling
Some chatter that is not a commitment.
Goal: Cut incident response time in half
Action item: Jordan will add a runbook link to every alert by Friday
Action item: Sam to rotate the staging credentials by 2026-11-14 (urgent)
Goal: Nobody is paged twice for the same incident
Action item: Morgan and Priya will draft the paging policy next week
Action: Jordan should write up the review, high priority`;

describe("fakeProposal", () => {
  const proposal = fakeProposal(context, notes);

  it("reads the meeting, the project and the goals", () => {
    expect(proposal.meetingTitle).toBe("Incident review, 1 Nov");
    expect(proposal.project.existingId).toBe("p-incidents");
    expect(proposal.goals.map((goal) => [goal.existingId, goal.title])).toEqual([
      ["g-incidents", "Cut incident response time in half"],
      [null, "Nobody is paged twice for the same incident"],
    ]);
  });

  it("turns action lines into tasks with people, dates and priorities", () => {
    expect(proposal.tasks.map((task) => task.title)).toEqual([
      "Add a runbook link to every alert",
      "Rotate the staging credentials",
      "Draft the paging policy",
      "Write up the review",
    ]);
    expect(proposal.tasks[0].assigneeIds).toEqual(["u-jordan"]);
    expect(proposal.tasks[0].dueDate).toBe("2026-11-06");
    expect(proposal.tasks[1].assigneeIds).toEqual(["u-sam"]);
    expect(proposal.tasks[1].dueDate).toBe("2026-11-14");
    expect(proposal.tasks[1].priority).toBe("urgent");
    expect(proposal.tasks[2].assigneeIds).toEqual(["u-morgan"]);
    expect(proposal.tasks[2].dueDate).toBe("2026-11-08");
    expect(proposal.tasks[3].priority).toBe("high");
  });

  it("points each task at the goal above it", () => {
    expect(proposal.tasks.map((task) => task.goalKey)).toEqual(["g1", "g1", "g2", "g2"]);
  });

  it("leaves a transcript without markers empty rather than inventing work", () => {
    const empty = fakeProposal(context, "We talked about many things.\nNothing was decided.");
    expect(empty.tasks).toEqual([]);
    expect(empty.goals).toEqual([]);
    expect(empty.project.existingId).toBeNull();
  });
});

describe("proposalToDraft", () => {
  it("keeps only ids the workspace has and clears dates that are not days", () => {
    const draft = proposalToDraft(
      {
        meetingTitle: "",
        summary: "Decided things.",
        project: { existingId: "p-nope", newName: null, newDescription: null, newTargetDate: null, goalKey: null },
        goals: [{ key: "g1", existingId: "g-nope", title: "A fresh outcome", description: null, targetDate: "soon", parentGoalId: "g-invites", evidence: "we want it" }],
        tasks: [
          { key: "t1", title: "Do the thing", description: null, nextAction: null, assigneeIds: ["u-jordan", "u-ghost"], unmatchedNames: ["Priya"], dueDate: "2026-02-30", priority: "normal", goalKey: "g1", evidence: "do it" },
          { key: "t1", title: "   ", description: null, nextAction: null, assigneeIds: [], unmatchedNames: [], dueDate: null, priority: "low", goalKey: "g-missing", evidence: "" },
          { key: "t1", title: "Second", description: null, nextAction: null, assigneeIds: [], unmatchedNames: [], dueDate: "2026-11-30", priority: "high", goalKey: "g-incidents", evidence: "" },
        ],
      },
      context,
    );
    expect(draft.meetingTitle).toBe("Meeting notes");
    expect(draft.project.mode).toBe("none");
    expect(draft.goals).toHaveLength(1);
    expect(draft.goals[0]).toMatchObject({ key: "g1", mode: "new", existingId: "", title: "A fresh outcome", targetDate: "", parentGoalId: "" });
    expect(draft.tasks.map((task) => task.key)).toEqual(["t1", "task-3"]);
    expect(draft.tasks[0]).toMatchObject({ assigneeIds: ["u-jordan"], unmatchedNames: ["Priya"], dueDate: "", goalKey: "g1" });
    expect(draft.tasks[1]).toMatchObject({ title: "Second", goalKey: "g-incidents", priority: "high" });
  });

  it("falls back to the project the person started from", () => {
    const draft = proposalToDraft(
      { meetingTitle: "Standup", summary: "", project: { existingId: null, newName: null, newDescription: null, newTargetDate: null, goalKey: null }, goals: [], tasks: [] },
      { ...context, defaultProjectId: "p-incidents" },
    );
    expect(draft.project).toMatchObject({ mode: "existing", existingId: "p-incidents" });
  });

  it("takes a new project with the goal it should roll up into", () => {
    const draft = proposalToDraft(
      {
        meetingTitle: "Kick-off",
        summary: "",
        project: { existingId: null, newName: "Status page", newDescription: "Public status page.", newTargetDate: "2026-12-15", goalKey: "g-incidents" },
        goals: [],
        tasks: [],
      },
      context,
    );
    expect(draft.project).toMatchObject({ mode: "new", name: "Status page", targetDate: "2026-12-15", goalKey: "g-incidents" });
  });
});
