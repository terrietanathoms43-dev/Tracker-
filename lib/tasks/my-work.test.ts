// My Work grouping (PLAN §5): every task in exactly one group, in the smart order, with its reason.
import { describe, expect, it } from "vitest";
import { groupMyWork, resumeOrder, type MyWorkRow } from "./my-work";
import type { TaskListItem } from "./types";

const ME = "me";
const TODAY = "2026-10-15";

let n = 0;
function row(partial: Partial<TaskListItem> & Partial<Omit<MyWorkRow, "item">> = {}): MyWorkRow {
  n += 1;
  const { approverId = null, mine = true, sortRank = 0, completedAt = null, sentBack = false, ...item } = partial;
  return {
    item: {
      id: `t${n}`,
      title: `Task ${n}`,
      status: "in_progress",
      priority: "normal",
      dueDate: null,
      nextAction: null,
      assignees: { people: [], teams: [] },
      project: null,
      updatedAt: `2026-10-${String(10 + n).padStart(2, "0")}T00:00:00.000Z`,
      ...item,
    },
    approverId,
    mine,
    sortRank,
    completedAt,
    sentBack,
  };
}

const titles = (items: TaskListItem[]) => items.map((item) => item.title);

describe("groupMyWork", () => {
  it("puts each task in exactly one group", () => {
    const rows = [
      row({ title: "overdue", dueDate: "2026-10-10" }),
      row({ title: "soon", dueDate: "2026-10-16" }),
      row({ title: "plain" }),
      row({ title: "blocked", status: "blocked" }),
      row({ title: "awaiting mine", status: "awaiting_approval", approverId: "morgan" }),
      row({ title: "to approve", status: "awaiting_approval", mine: false, approverId: ME }),
      row({ title: "sent back", sentBack: true }),
      row({ title: "done", status: "completed", completedAt: new Date("2026-10-14T10:00:00Z") }),
    ];
    const groups = groupMyWork(rows, ME, TODAY);
    expect(titles(groups.attention)).toEqual(["overdue", "soon", "sent back", "to approve"]);
    expect(titles(groups.waiting)).toEqual(["awaiting mine", "blocked"]);
    expect(titles(groups.continueWorking)).toEqual(["plain"]);
    expect(titles(groups.finished)).toEqual(["done"]);
    const all = [...groups.attention, ...groups.waiting, ...groups.continueWorking, ...groups.finished];
    expect(new Set(all.map((item) => item.id)).size).toBe(rows.length);
  });

  it("says why each task needs attention", () => {
    const groups = groupMyWork(
      [
        row({ dueDate: "2026-10-01" }),
        row({ dueDate: TODAY }),
        row({ dueDate: "2026-10-17" }),
        row({ status: "blocked", dueDate: "2026-10-16" }),
        row({ status: "awaiting_approval", mine: false, approverId: ME }),
        row({ sentBack: true }),
      ],
      ME,
      TODAY,
    );
    expect(groups.attention.map((item) => item.reason)).toEqual(["Overdue", "Due soon", "Blocked", "Due soon", "Sent back", "Your approval"]);
  });

  it("treats work assigned through a team like my own, keeping the team's name on the row", () => {
    const groups = groupMyWork([row({ title: "team work", via: "Frontend", dueDate: "2026-10-01" }), row({ title: "team plain", via: "Frontend" })], ME, TODAY);
    expect(groups.attention.map((item) => [item.title, item.reason, item.via])).toEqual([["team work", "Overdue", "Frontend"]]);
    expect(groups.continueWorking.map((item) => item.via)).toEqual(["Frontend"]);
  });

  it("orders continue-working by due date, then priority, then manual rank, then recency", () => {
    const groups = groupMyWork(
      [
        row({ title: "normal, no date, old", updatedAt: "2026-10-01T00:00:00.000Z" }),
        row({ title: "normal, no date, new", updatedAt: "2026-10-14T00:00:00.000Z" }),
        row({ title: "urgent, no date", priority: "urgent" }),
        row({ title: "ranked up", sortRank: 5 }),
        row({ title: "due next week", dueDate: "2026-10-22", priority: "low" }),
      ],
      ME,
      TODAY,
    );
    expect(titles(groups.continueWorking)).toEqual(["due next week", "urgent, no date", "ranked up", "normal, no date, new", "normal, no date, old"]);
  });

  it("leaves my task that waits for someone else's approval in waiting, even when it is due", () => {
    const groups = groupMyWork([row({ status: "awaiting_approval", approverId: "morgan", dueDate: "2026-10-14" })], ME, TODAY);
    expect(groups.attention).toHaveLength(0);
    expect(groups.waiting).toHaveLength(1);
  });

  it("keeps a blocked task that is due now in needs attention, and one without a date in waiting", () => {
    const groups = groupMyWork([row({ status: "blocked", dueDate: "2026-10-16" }), row({ status: "blocked" }), row({ status: "blocked", dueDate: "2026-11-30" })], ME, TODAY);
    expect(groups.attention).toHaveLength(1);
    expect(groups.waiting).toHaveLength(2);
  });

  it("lists finished work most recent first and ignores other people's tasks", () => {
    const groups = groupMyWork(
      [
        row({ title: "older", status: "completed", completedAt: new Date("2026-10-10T00:00:00Z") }),
        row({ title: "newer", status: "completed", completedAt: new Date("2026-10-14T00:00:00Z") }),
        row({ title: "someone else's", mine: false, dueDate: "2026-10-01" }),
        row({ title: "rejected", status: "rejected" }),
      ],
      ME,
      TODAY,
    );
    expect(titles(groups.finished)).toEqual(["newer", "older"]);
    expect(groups.continueWorking).toHaveLength(0);
    expect(groups.attention).toHaveLength(0);
  });

  it("offers what can be picked up: attention first, then continue working", () => {
    const groups = groupMyWork([row({ title: "plain" }), row({ title: "late", dueDate: "2026-10-01" }), row({ title: "blocked", status: "blocked" })], ME, TODAY);
    expect(titles(resumeOrder(groups))).toEqual(["late", "plain"]);
  });
});
