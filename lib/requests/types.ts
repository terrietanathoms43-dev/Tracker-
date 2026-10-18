import type { RequestDecision, RequestStatus, RequestUrgency, TaskStatus } from "@/lib/constants";
import type { Person } from "@/lib/tasks/types";

// Request shapes that cross from server to client: plain JSON only (instants as ISO strings, calendar days as
// "YYYY-MM-DD"), so a server component can hand them straight to a client component.

/** One row of the requests page, the review queue's sections, or Home's "Your requests". */
export type RequestListItem = {
  id: string;
  title: string;
  status: RequestStatus;
  urgency: RequestUrgency;
  requester: Person;
  createdAt: string;
  decidedAt: string | null;
  /** The reason given with the current decision (what the requester reads). */
  decisionReason: string | null;
  deferUntil: string | null;
  /** The task it became, once converted. */
  task: { id: string; status: TaskStatus } | null;
};

/** One entry of a request's append-only decision history. */
export type RequestDecisionItem = {
  id: string;
  decision: RequestDecision;
  reason: string | null;
  decider: Person;
  at: string;
};

/** Everything the request page shows about the request itself (the linked task is read through the task DAL). */
export type RequestDetail = {
  id: string;
  title: string;
  description: string | null;
  desiredOutcome: string | null;
  urgency: RequestUrgency;
  link: string | null;
  status: RequestStatus;
  requester: Person;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: Person | null;
  decisionReason: string | null;
  deferUntil: string | null;
  taskId: string | null;
  /** Newest first. */
  decisions: RequestDecisionItem[];
};

/** The /requests address: a status, only my own, and a title search. Empty means "not narrowed". */
export type RequestFilters = { status: RequestStatus | ""; mine: boolean; q: string };

/** The review queue, top to bottom in the order a leader works through it (apex-ux flow G). */
export type RequestSections = {
  /** New: oldest first, they have waited longest. */
  pending: RequestListItem[];
  /** Deferred: passed revisit dates first, then by revisit date, undated last. */
  deferred: RequestListItem[];
  /** Approved and not yet a task: oldest decision first. */
  approved: RequestListItem[];
  /** Rejected or converted in the last RECENTLY_DECIDED_DAYS days: newest decision first. */
  decided: RequestListItem[];
};
