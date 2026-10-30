import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { NewRequestDialog } from "@/components/requests/new-request-dialog";
import { RequestRow } from "@/components/requests/request-row";
import { Panel } from "@/components/dashboard/panel";
import type { RequestStatus } from "@/lib/constants";
import type { RequestListItem } from "@/lib/requests/types";

// A stakeholder's Home: what they asked for, split into what still waits for a decision and what was decided.

/** New and deferred requests still wait for a final word; approved, converted and rejected ones have it. */
const WAITING: readonly RequestStatus[] = ["new", "deferred"];

/** How many rows each panel shows before "See all" on /requests. */
const SHOWN = 10;

export function StakeholderHome({
  title,
  requests,
  now,
  today,
  timeZone,
}: {
  title: string;
  requests: RequestListItem[];
  now: Date;
  today: string;
  timeZone: string;
}) {
  const waiting = requests.filter((request) => WAITING.includes(request.status));
  const decided = requests.filter((request) => !WAITING.includes(request.status));
  const rows = (items: RequestListItem[]) => (
    <ul className="divide-y">
      {items.slice(0, SHOWN).map((request) => (
        <RequestRow key={request.id} request={request} now={now} today={today} timeZone={timeZone} showRequester={false} />
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader title={title} description="Ask for what you need, and follow what happens to it." action={<NewRequestDialog />} />
      {requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="You haven't asked for anything yet"
          description="Send a request and a leader decides on it. Every decision shows up here, with the reason."
          action={<NewRequestDialog variant="outline" />}
        />
      ) : (
        <div className="grid gap-6">
          {waiting.length > 0 ? (
            <Panel title={`Waiting on a decision · ${waiting.length}`} href="/requests">
              {rows(waiting)}
            </Panel>
          ) : null}
          {decided.length > 0 ? (
            <Panel title={waiting.length > 0 ? "Decided" : "Your requests"} href="/requests">
              {rows(decided)}
            </Panel>
          ) : null}
        </div>
      )}
    </>
  );
}
