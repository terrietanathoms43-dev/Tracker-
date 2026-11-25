// Workspace-configurable statuses (2026-11-11): how a workspace's rows overlay the defaults, and the words that follow them.
import { describe, expect, it } from "vitest";
import { boardStatuses } from "@/lib/tasks/board";
import { phraseFeed, phraseHistory, type FeedRow, type HistoryRow } from "@/lib/tasks/history";
import { planTransition, reasonPrompt } from "@/lib/tasks/transitions";
import {
  archiveLocked,
  backToWorkTarget,
  closedLocked,
  closedStatusNames,
  closedStatusKeys,
  menuStatuses,
  requiresEditToEnter,
  resolveStatuses,
  statusDef,
  statusLabel,
  statusToast,
  statusWord,
  transitionTitle,
  type StatusRow,
} from "./statuses";

const row = (key: string, overrides: Partial<StatusRow> = {}): StatusRow => ({ key, label: key, icon: "star", tone: "slate", closed: false, archivedAt: null, position: 50, ...overrides });
const at = new Date("2026-11-01T00:00:00Z");
const DEFAULT_CATALOG = resolveStatuses([]);

describe("resolveStatuses", () => {
  it("is the nine defaults with no rows", () => {
    const catalog = resolveStatuses([]);
    expect(catalog.map((status) => status.key)).toEqual(["not_started", "in_progress", "awaiting_approval", "blocked", "deferred", "rejected", "cancelled", "merged", "completed"]);
    expect(closedStatusKeys(catalog).sort()).toEqual(["cancelled", "completed", "deferred", "merged", "rejected"]);
  });

  it("keeps a renamed built-in's behaviour", () => {
    const done = statusDef(resolveStatuses([row("completed", { label: "Complete JA", closed: true, position: 8 })]), "completed");
    expect(done).toMatchObject({ label: "Complete JA", kind: "completed", closed: true, builtin: true });
  });

  it("holds the fixed flags whatever a row says: work going on stays open, finishing stays closed", () => {
    const catalog = resolveStatuses([row("not_started", { closed: true }), row("blocked", { closed: true }), row("awaiting_approval", { closed: true }), row("completed", { closed: false }), row("merged", { closed: false })]);
    expect(statusDef(catalog, "not_started").closed).toBe(false);
    expect(statusDef(catalog, "blocked")).toMatchObject({ closed: false, kind: "blocked" });
    expect(statusDef(catalog, "awaiting_approval").closed).toBe(false);
    expect(statusDef(catalog, "completed").closed).toBe(true);
    expect(statusDef(catalog, "merged").closed).toBe(true);
    for (const key of ["not_started", "in_progress", "blocked", "awaiting_approval", "completed", "merged"]) expect(closedLocked(statusDef(catalog, key))).toBe(true);
    for (const key of ["deferred", "rejected", "cancelled"]) expect(closedLocked(statusDef(catalog, key))).toBe(false);
  });

  it("makes a reopened Deferred, Rejected or Cancelled plain open work: no reason, no edit right", () => {
    const rejected = statusDef(resolveStatuses([row("rejected", { label: "Rejected", closed: false })]), "rejected");
    expect(rejected).toMatchObject({ kind: "open", closed: false });
    expect(requiresEditToEnter(rejected)).toBe(false);
    const plan = planTransition({ status: "in_progress", startedAt: at, approverId: null, blockedReason: null, openComments: 0, parentTaskId: null }, "rejected", {}, at, resolveStatuses([row("rejected", { closed: false })]));
    expect(plan.ok).toBe(true);
  });

  it("never archives Not started or Completed", () => {
    const catalog = resolveStatuses([row("not_started", { archivedAt: at }), row("completed", { archivedAt: at, closed: true }), row("deferred", { archivedAt: at, closed: true })]);
    expect(statusDef(catalog, "not_started").archived).toBe(false);
    expect(statusDef(catalog, "completed").archived).toBe(false);
    expect(statusDef(catalog, "deferred").archived).toBe(true);
    expect(archiveLocked(statusDef(catalog, "not_started"))).toBe(true);
    expect(archiveLocked(statusDef(catalog, "deferred"))).toBe(false);
  });

  it("makes a custom status open or closed by its flag, closed ones an edit right", () => {
    const catalog = resolveStatuses([row("custom_aaaa0001", { label: "QA gate", closed: true }), row("custom_aaaa0002", { label: "In review" })]);
    expect(statusDef(catalog, "custom_aaaa0001")).toMatchObject({ kind: "closed", builtin: false });
    expect(requiresEditToEnter(statusDef(catalog, "custom_aaaa0001"))).toBe(true);
    expect(statusDef(catalog, "custom_aaaa0002")).toMatchObject({ kind: "open", closed: false });
    expect(closedLocked(statusDef(catalog, "custom_aaaa0001"))).toBe(false);
  });
});

describe("the words a status is named by", () => {
  const catalog = resolveStatuses([row("completed", { label: "Done deal", closed: true, position: 8 }), row("custom_aaaa0001", { label: "QA gate", closed: true })]);

  it("keeps the factory words only while a built-in keeps its name", () => {
    expect(transitionTitle(statusDef(catalog, "rejected"))).toBe("Reject this task");
    expect(transitionTitle(statusDef(catalog, "completed"))).toBe("Mark as Done deal");
    expect(statusToast(statusDef(catalog, "rejected"))).toBe("Task rejected.");
    expect(statusToast(statusDef(catalog, "completed"))).toBe("Marked Done deal.");
    expect(statusToast(statusDef(catalog, "custom_aaaa0001"))).toBe("Task QA gate.");
  });

  it("lowercases a built-in inside a sentence, never a workspace's own name", () => {
    expect(statusWord(statusDef(catalog, "in_progress"))).toBe("in progress");
    expect(statusWord(statusDef(catalog, "custom_aaaa0001"))).toBe("QA gate");
    expect(closedStatusNames(catalog)).toBe("deferred, rejected, cancelled, Done deal or QA gate");
  });

  it("asks a renamed closed status the generic question", () => {
    const renamed = resolveStatuses([row("rejected", { label: "Declined", closed: true })]);
    expect(reasonPrompt(statusDef(DEFAULT_CATALOG, "rejected"))).toBe("Give a reason for rejecting it.");
    expect(reasonPrompt(statusDef(renamed, "rejected"))).toBe("Give a reason for closing it.");
  });

  it("phrases history and the feed in the workspace's words", () => {
    const history = (kind: string, after: Record<string, unknown>): HistoryRow =>
      ({ type: "activity", id: "a1", created_at: at.toISOString(), actor_id: "u1", actor_name: "Avery", actor_email: null, actor_image: null, kind, before: {}, after, note: null, body: null, next_action: null, blocker: null, resolved_at: null, resolved_by_name: null, before_assignee: null, after_assignee: null, approver_name: null }) as HistoryRow;
    expect(phraseHistory(history("completed", { status: "completed" }), "UTC", at, DEFAULT_CATALOG).phrase).toBe("completed it");
    expect(phraseHistory(history("completed", { status: "completed" }), "UTC", at, catalog).phrase).toBe("marked it Done deal");
    expect(phraseHistory(history("completed", {}), "UTC", at, catalog).phrase).toBe("marked it Done deal");
    const feed: FeedRow = { id: "a1", kind: "completed", note: null, before: null, after: { status: "completed" }, createdAt: at, taskId: "t1", taskTitle: "Ship it", actor: { id: "u1", name: "Avery", email: null, image: null } };
    expect(phraseFeed(feed, "2026-11-01", DEFAULT_CATALOG).summary).toBe("Avery completed Ship it");
    expect(phraseFeed(feed, "2026-11-01", catalog).summary).toBe("Avery marked Done deal: Ship it");
  });

  it("names a deleted custom status 'a removed status', never its raw key", () => {
    expect(statusLabel(DEFAULT_CATALOG, "custom_gone1234")).toBe("a removed status");
    expect(statusLabel(DEFAULT_CATALOG, "in_progress")).toBe("In progress");
    const history: HistoryRow = { type: "activity", id: "a1", created_at: at.toISOString(), actor_id: "u1", actor_name: "Avery", actor_email: null, actor_image: null, kind: "status_changed", before: { status: "custom_gone1234" }, after: { status: "completed" }, note: null, body: null, next_action: null, blocker: null, resolved_at: null, resolved_by_name: null, before_assignee: null, after_assignee: null, approver_name: null } as HistoryRow;
    expect(phraseHistory(history, "UTC", at, DEFAULT_CATALOG).change).toEqual({ before: "a removed status", after: "Completed" });
  });
});

describe("archived statuses on screens", () => {
  const catalog = resolveStatuses([row("custom_aaaa0002", { label: "In review", archivedAt: at })]);

  it("leave the menus, except as the task's own current status", () => {
    expect(menuStatuses(catalog, "in_progress").some((status) => status.key === "custom_aaaa0002")).toBe(false);
    expect(menuStatuses(catalog, "custom_aaaa0002").some((status) => status.key === "custom_aaaa0002")).toBe(true);
  });

  it("stay among the board's columns, for the board to draw while tasks have them", () => {
    expect(boardStatuses(catalog).map((status) => status.key)).toContain("custom_aaaa0002");
    expect(boardStatuses(catalog).map((status) => status.key)).not.toContain("rejected");
  });
});

describe("backToWorkTarget", () => {
  it("is the in-progress-kind status while it is pickable", () => {
    expect(backToWorkTarget(resolveStatuses([]))).toBe("in_progress");
  });

  it("falls back to the first open status when In progress is archived", () => {
    const catalog = resolveStatuses([row("in_progress", { archivedAt: at })]);
    expect(backToWorkTarget(catalog)).toBe("not_started");
  });
});

