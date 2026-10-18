import {
  REQUEST_STATUS_LABELS,
  type RequestDecision,
  type RequestStatus,
  type RequestUrgency,
  type TaskPriority,
} from "@/lib/constants";
import { formatDay } from "@/lib/time";
import type { RequestDecisionItem } from "./types";

// The rules for deciding a request, in one table that the Decide menu, the detail page's buttons and the
// decideRequest action all read, so what the screen offers and what the server accepts can never diverge.

/** Which decisions a leader may make from each status. A converted request is settled: its task carries on. */
export const DECISIONS_FOR: Record<RequestStatus, readonly RequestDecision[]> = {
  new: ["approved", "deferred", "rejected"],
  approved: ["converted", "deferred", "rejected"],
  // Deferring again moves the revisit date; reopening puts it back in "Needs a decision".
  deferred: ["approved", "deferred", "rejected", "reopened"],
  rejected: ["reopened"],
  converted: [],
};

/** The status each decision leaves the request in. */
export const STATUS_AFTER: Record<RequestDecision, RequestStatus> = {
  approved: "approved",
  deferred: "deferred",
  rejected: "rejected",
  converted: "converted",
  reopened: "new",
};

export const DECISION_LABELS: Record<RequestDecision, string> = {
  approved: "Approve",
  deferred: "Defer",
  rejected: "Reject",
  converted: "Convert to task",
  reopened: "Reopen",
};

export const DECISION_TOASTS: Record<RequestDecision, string> = {
  approved: "Approved.",
  deferred: "Deferred.",
  rejected: "Rejected.",
  converted: "Converted to a task.",
  reopened: "Reopened.",
};

/** A request's urgency as the starting priority of the task it becomes (the leader can change it). */
export const PRIORITY_FOR_URGENCY: Record<RequestUrgency, TaskPriority> = {
  low: "low",
  normal: "normal",
  high: "high",
  critical: "urgent",
};

export const decisionsFor = (status: RequestStatus): readonly RequestDecision[] => DECISIONS_FOR[status];

/** Why `decision` can't be made on a request in `status`, in words a leader can act on; null when it can. */
export function decisionProblem(status: RequestStatus, decision: RequestDecision): string | null {
  if (DECISIONS_FOR[status].includes(decision)) return null;
  if (status === "converted") return "This request is already a task. Follow it on the task instead.";
  if (decision === "reopened") return "Only a deferred or rejected request can be reopened.";
  if (decision === "converted") return "Approve the request before converting it to a task.";
  if (status === "rejected") return "This request was rejected. Reopen it first.";
  return `This request is already ${REQUEST_STATUS_LABELS[status].toLowerCase()}.`;
}

// --- history ---------------------------------------------------------------------------------------------------

/** The words after the decider's name: "deferred it until Oct 30". */
export function decisionVerb(decision: RequestDecision, deferUntil: string | null, today: string): string {
  switch (decision) {
    case "approved":
      return "approved it";
    case "deferred":
      return deferUntil ? `deferred it until ${formatDay(deferUntil, today)}` : "deferred it";
    case "rejected":
      return "rejected it";
    case "converted":
      return "converted it to a task";
    case "reopened":
      return "reopened it";
  }
}

export type PhrasedDecision = RequestDecisionItem & { verb: string };

/**
 * The decision history, newest first, each entry phrased ("Morgan Lead deferred it until Oct 30: waiting on
 * budget"). Decision rows don't keep a revisit date, so only the deferral still in force names one: the
 * request's own `deferUntil`.
 */
export function phraseDecisions(
  decisions: RequestDecisionItem[],
  current: { status: RequestStatus; deferUntil: string | null },
  today: string,
): PhrasedDecision[] {
  return decisions.map((decision, index) => {
    const inForce = index === 0 && decision.decision === "deferred" && current.status === "deferred";
    return { ...decision, verb: decisionVerb(decision.decision, inForce ? current.deferUntil : null, today) };
  });
}
