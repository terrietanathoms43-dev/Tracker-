// The default approver: the named one, else a leader or admin who isn't doing the work.
import { describe, expect, it } from "vitest";
import { defaultApproverFor } from "./approver";

const people = [
  { id: "avery", role: "admin" as const },
  { id: "morgan", role: "leader" as const },
  { id: "jordan", role: "member" as const },
];

describe("defaultApproverFor", () => {
  it("keeps the approver the task already has", () => {
    expect(defaultApproverFor(people, "avery", "jordan")).toBe("avery");
  });

  it("prefers a leader, then an admin, never the assignee while someone else can", () => {
    expect(defaultApproverFor(people, null, "jordan")).toBe("morgan");
    expect(defaultApproverFor(people, null, "morgan")).toBe("avery");
    expect(defaultApproverFor([{ id: "morgan", role: "leader" }], null, "morgan")).toBe("morgan");
  });

  it("returns null when there is nobody who can approve", () => {
    expect(defaultApproverFor([{ id: "jordan", role: "member" }], null, null)).toBeNull();
  });
});
