import { REQUEST_STATUSES, type RequestStatus } from "@/lib/constants";
import type { RequestFilters, RequestListItem, RequestSections } from "./types";

// What the requests page shows: the filters kept in the address (apex-ux §6, so a view can be shared and the back
// button works) and the review queue's sections. Pure, so both are unit-tested without a database.

/** "Decided recently" in the review queue looks back this far. */
export const RECENTLY_DECIDED_DAYS = 14;

export const DEFAULT_REQUEST_FILTERS: RequestFilters = { status: "", mine: false, q: "" };

type Raw = Record<string, string | string[] | undefined>;

const one = (raw: Raw, key: string): string => {
  const value = raw[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
};

/** Reads the filters from searchParams, dropping anything it does not recognise. */
export function parseRequestFilters(raw: Raw): RequestFilters {
  const status = one(raw, "status");
  return {
    status: (REQUEST_STATUSES as readonly string[]).includes(status) ? (status as RequestStatus) : "",
    mine: one(raw, "mine") === "1",
    q: one(raw, "q").slice(0, 100),
  };
}

/** The /requests address for some filters; only what differs from the defaults goes into it. */
export function requestsHref(filters: Partial<RequestFilters>): string {
  const full = { ...DEFAULT_REQUEST_FILTERS, ...filters };
  const params = new URLSearchParams();
  if (full.status) params.set("status", full.status);
  if (full.mine) params.set("mine", "1");
  if (full.q) params.set("q", full.q);
  const query = params.toString();
  return query ? `/requests?${query}` : "/requests";
}

/** Whether anything narrows the page: then it shows one matching list instead of the review sections. */
export function isRequestFiltered(filters: RequestFilters): boolean {
  return requestsHref(filters) !== "/requests";
}

// --- the review queue ------------------------------------------------------------------------------------------

/** A deferred request whose revisit date has come: it leads the Deferred section, marked "Revisit now". */
export function isRevisitDue(request: Pick<RequestListItem, "status" | "deferUntil">, today: string): boolean {
  return request.status === "deferred" && request.deferUntil !== null && request.deferUntil <= today;
}

const byCreated = (a: RequestListItem, b: RequestListItem) => a.createdAt.localeCompare(b.createdAt);
const byDecided = (a: RequestListItem, b: RequestListItem) => (a.decidedAt ?? a.createdAt).localeCompare(b.decidedAt ?? b.createdAt);

/** Revisit dates that have come first, then the earliest revisit date, undated deferrals last, ties by age. */
const byRevisit = (today: string) => (a: RequestListItem, b: RequestListItem): number => {
  const due = Number(isRevisitDue(b, today)) - Number(isRevisitDue(a, today));
  if (due !== 0) return due;
  if (a.deferUntil === b.deferUntil) return byCreated(a, b);
  if (a.deferUntil === null) return 1;
  if (b.deferUntil === null) return -1;
  return a.deferUntil.localeCompare(b.deferUntil);
};

/**
 * Sorts requests into the review queue's sections. `items` should already be limited to what the queue shows (every
 * new, deferred and approved request, plus rejected and converted ones decided in the last RECENTLY_DECIDED_DAYS).
 */
export function groupRequestSections(items: RequestListItem[], today: string): RequestSections {
  const withStatus = (...statuses: RequestStatus[]) => items.filter((item) => statuses.includes(item.status));
  return {
    pending: withStatus("new").sort(byCreated),
    deferred: withStatus("deferred").sort(byRevisit(today)),
    approved: withStatus("approved").sort(byDecided),
    decided: withStatus("rejected", "converted").sort((a, b) => byDecided(b, a)),
  };
}
