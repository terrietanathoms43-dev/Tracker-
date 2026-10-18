import type { ReactNode } from "react";
import { RECENTLY_DECIDED_DAYS } from "@/lib/requests/filters";
import type { RequestListItem, RequestSections } from "@/lib/requests/types";
import { RequestRow } from "./request-row";

// The review queue on /requests (apex-ux flow G): four sections a leader works through top to bottom, deciding in
// place. Members see the same sections without the controls.

type RowContext = { now: Date; today: string; timeZone: string; showControls: boolean };

/** A list of request rows in a bordered card. */
export function RequestList({ items, showRequester = true, ...row }: { items: RequestListItem[]; showRequester?: boolean } & RowContext) {
  return (
    <ul className="divide-y overflow-hidden rounded-lg border bg-card">
      {items.map((request) => (
        <RequestRow key={request.id} request={request} showRequester={showRequester} {...row} />
      ))}
    </ul>
  );
}

/** A titled, counted group of request rows, with one plain sentence when it's empty. */
function RequestSection({ id, title, description, items, empty, ...row }: { id: string; title: string; description: string; items: RequestListItem[]; empty: ReactNode } & RowContext) {
  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-0.5">
        <div className="flex items-baseline gap-2">
          <h2 id={`${id}-heading`} className="text-sm font-semibold">
            {title}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${items.length} requests`}>
            {items.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {items.length === 0 ? <p className="rounded-lg border border-dashed bg-card px-4 py-5 text-sm text-muted-foreground">{empty}</p> : <RequestList items={items} {...row} />}
    </section>
  );
}

/** Every section of the queue, in the order the weekly review works through them. */
export function RequestQueue({ sections, ...row }: { sections: RequestSections } & RowContext) {
  return (
    <div className="grid gap-8">
      <RequestSection
        id="needs-decision"
        title="Needs a decision"
        description="Oldest first: they have waited longest."
        items={sections.pending}
        empty={row.showControls ? "Nothing is waiting for your decision." : "Nothing is waiting for a decision."}
        {...row}
      />
      <RequestSection id="deferred" title="Deferred" description="Revisit dates that have passed come first." items={sections.deferred} empty="Nothing is deferred." {...row} />
      <RequestSection
        id="approved"
        title="Approved, not yet converted"
        description="Approved work that isn't a task yet."
        items={sections.approved}
        empty="Every approved request is already a task."
        {...row}
      />
      <RequestSection
        id="decided"
        title="Decided recently"
        description={`Rejected or converted in the last ${RECENTLY_DECIDED_DAYS} days.`}
        items={sections.decided}
        empty={`No requests were rejected or converted in the last ${RECENTLY_DECIDED_DAYS} days.`}
        {...row}
      />
    </div>
  );
}
