// Assignment as a set: the helpers every action and screen spell "who is on this" with.
import { describe, expect, it } from "vitest";
import { describeAssignees, diffAssignees, joinNames, listNames, sameIds, snapshotOf, uniqueIds } from "./assignees";

const jordan = { id: "j", name: "Jordan Dev", email: "jordan@x.test", image: null };
const sam = { id: "s", name: null, email: "sam@x.test", image: null };
const frontend = { id: "f", name: "Frontend" };

describe("assignees", () => {
  it("describes people then teams, or says Unassigned", () => {
    expect(describeAssignees({ people: [jordan, sam], teams: [frontend] })).toBe("Jordan Dev, sam@x.test · Frontend");
    expect(describeAssignees({ people: [], teams: [frontend] })).toBe("Frontend");
    expect(describeAssignees({ people: [], teams: [] })).toBe("Unassigned");
    expect(describeAssignees({ people: [], teams: [] }, "Nobody yet")).toBe("Nobody yet");
  });

  it("keeps names in the audit snapshot and lists them in sentence form", () => {
    const snapshot = snapshotOf({ people: [jordan, sam], teams: [frontend] });
    expect(snapshot).toEqual({ assignees: [{ id: "j", name: "Jordan Dev" }, { id: "s", name: "sam@x.test" }], teams: [{ id: "f", name: "Frontend" }] });
    expect(joinNames(listNames(snapshot))).toBe("Jordan Dev, sam@x.test and Frontend");
    expect(joinNames(["Jordan Dev"])).toBe("Jordan Dev");
    expect(joinNames([])).toBe("");
    expect(listNames(null)).toEqual([]);
  });

  it("diffs two sets by id", () => {
    const diff = diffAssignees({ assigneeIds: ["j"], teamIds: ["f"] }, { assigneeIds: ["s"], teamIds: ["f", "p"] });
    expect(diff).toEqual({ addedPeople: ["s"], removedPeople: ["j"], addedTeams: ["p"], removedTeams: [] });
  });

  it("dedupes ids and compares sets whatever the order", () => {
    expect(uniqueIds(["a", "", "b", "a"])).toEqual(["a", "b"]);
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
  });
});
