import { Inbox, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { NewRequestDialog } from "@/components/requests/new-request-dialog";
import { RequestList, RequestQueue } from "@/components/requests/request-queue";
import { RequestToolbar } from "@/components/requests/request-toolbar";
import { Button } from "@/components/ui/button";
import { listRequests, requestSections } from "@/lib/dal/requests";
import { canDecideRequest, isStakeholder, type Viewer } from "@/lib/permissions";
import { isRequestFiltered, parseRequestFilters } from "@/lib/requests/filters";
import type { RequestSections } from "@/lib/requests/types";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /requests: the review queue for leaders, the same sections read-only for members, and a stakeholder's own requests.

export const metadata: Metadata = { title: "Requests" };

const isEmpty = (sections: RequestSections) => Object.values(sections).every((items) => items.length === 0);

/** A stakeholder's view: what they asked for, newest first, with each decision's reason. */
async function YourRequests({ viewer, now, today }: { viewer: Viewer; now: Date; today: string }) {
  const items = await listRequests(viewer);
  return (
    <>
      <PageHeader title="Requests" description="What you've asked for, and what was decided." action={<NewRequestDialog />} />
      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="You haven't asked for anything yet"
          description="Send a request and follow it here: every decision comes with a reason."
          action={<NewRequestDialog variant="outline" />}
        />
      ) : (
        <section aria-labelledby="your-requests-heading">
          <div className="mb-2 flex items-baseline gap-2 px-0.5">
            <h2 id="your-requests-heading" className="text-sm font-semibold">
              Your requests
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
          </div>
          <RequestList items={items} now={now} today={today} timeZone={viewer.timezone} showControls={false} showRequester={false} />
        </section>
      )}
    </>
  );
}

/**
 * Leaders and admins: "What needs my decision?", answered by the review queue, deciding in place. Members read the
 * same sections. Any filter in the address turns the sections into one matching list.
 */
export default async function RequestsPage(props: PageProps<"/requests">) {
  const viewer = await requireViewer();
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  if (isStakeholder(viewer)) return <YourRequests viewer={viewer} now={now} today={today} />;

  const filters = parseRequestFilters(await props.searchParams);
  const filtered = isRequestFiltered(filters);
  const leader = canDecideRequest(viewer);
  const row = { now, today, timeZone: viewer.timezone, showControls: leader };
  const [sections, matches] = await Promise.all([filtered ? null : requestSections(viewer, today), filtered ? listRequests(viewer, filters) : null]);

  return (
    <>
      <PageHeader
        title="Requests"
        description={leader ? "Decide each new request. The requester hears every decision and its reason." : "What people have asked the team for, and what was decided."}
        action={<NewRequestDialog />}
      />
      <RequestToolbar filters={filters} />
      {matches ? (
        matches.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No requests match these filters"
            action={
              <Button asChild variant="outline">
                <Link href="/requests">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <RequestList items={matches} {...row} />
        )
      ) : sections && isEmpty(sections) ? (
        <EmptyState
          icon={Inbox}
          title="No requests yet"
          description={leader ? "When someone asks the team for something, it lands here for your decision." : "Ask the team for something and it shows up here, with what was decided."}
          action={<NewRequestDialog variant="outline" />}
        />
      ) : sections ? (
        <RequestQueue sections={sections} {...row} />
      ) : null}
    </>
  );
}
