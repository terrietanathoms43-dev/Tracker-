// The requests page's URL state and the review queue's sections.
import { describe, expect, it } from "vitest";
import { DEFAULT_REQUEST_FILTERS, groupRequestSections, isRequestFiltered, isRevisitDue, parseRequestFilters, requestsHref } from "./filters";
import type { RequestListItem } from "./types";

const person = { id: "u-1", name: "Taylor Ops", email: "taylor@trackwise.test", image: null };

function request(id: string, patch: Partial<RequestListItem>): RequestListItem {
  return {
    id,
    title: id,
    status: "new",
    urgency: "normal",
    requester: person,
    createdAt: "2026-10-01T12:00:00.000Z",
    decidedAt: null,
    decisionReason: null,
    deferUntil: null,
    task: null,
    ...patch,
  };
}

describe("requests URL state", () => {
  it("round-trips through the URL", () => {
    const filters = { status: "deferred", mine: true, q: "invoice" } as const;
    expect(parseRequestFilters(Object.fromEntries(new URL(requestsHref(filters), "http://x").searchParams))).toEqual(filters);
  });

  it("drops anything it does not recognise, and caps the search", () => {
    expect(parseRequestFilters({ status: "under_review", mine: "yes" })).toEqual(DEFAULT_REQUEST_FILTERS);
    expect(parseRequestFilters({ status: ["rejected", "new"], q: "x".repeat(300) })).toEqual({ status: "rejected", mine: false, q: "x".repeat(100) });
  });

  it("keeps the defaults out of the URL", () => {
    expect(requestsHref({})).toBe("/requests");
    expect(requestsHref({ mine: true, status: "approved" })).toBe("/requests?status=approved&mine=1");
    expect(isRequestFiltered(DEFAULT_REQUEST_FILTERS)).toBe(false);
    expect(isRequestFiltered({ ...DEFAULT_REQUEST_FILTERS, q: "sso" })).toBe(true);
  });
});

describe("review queue sections", () => {
  it("says a deferral is due on and after its revisit date, never without one", () => {
    expect(isRevisitDue({ status: "deferred", deferUntil: "2026-10-17" }, "2026-10-17")).toBe(true);
    expect(isRevisitDue({ status: "deferred", deferUntil: "2026-10-18" }, "2026-10-17")).toBe(false);
    expect(isRevisitDue({ status: "deferred", deferUntil: null }, "2026-10-17")).toBe(false);
    expect(isRevisitDue({ status: "new", deferUntil: "2026-10-01" }, "2026-10-17")).toBe(false);
  });

  it("puts each request in its section, in the order a leader works through it", () => {
    const sections = groupRequestSections([
      request("new-recent", { createdAt: "2026-10-16T00:00:00.000Z" }),
      request("new-old", { createdAt: "2026-10-02T00:00:00.000Z" }),
      request("deferred-undated", { status: "deferred" }),
      request("deferred-later", { status: "deferred", deferUntil: "2026-11-30" }),
      request("deferred-passed", { status: "deferred", deferUntil: "2026-10-10" }),
      request("approved-recent", { status: "approved", decidedAt: "2026-10-15T00:00:00.000Z" }),
      request("approved-old", { status: "approved", decidedAt: "2026-10-05T00:00:00.000Z" }),
      request("rejected", { status: "rejected", decidedAt: "2026-10-09T00:00:00.000Z" }),
      request("converted", { status: "converted", decidedAt: "2026-10-12T00:00:00.000Z" }),
    ], "2026-10-17");
    const ids = (items: RequestListItem[]) => items.map((item) => item.id);
    expect(ids(sections.pending)).toEqual(["new-old", "new-recent"]);
    expect(ids(sections.deferred)).toEqual(["deferred-passed", "deferred-later", "deferred-undated"]);
    expect(ids(sections.approved)).toEqual(["approved-old", "approved-recent"]);
    expect(ids(sections.decided)).toEqual(["converted", "rejected"]);
  });
});
