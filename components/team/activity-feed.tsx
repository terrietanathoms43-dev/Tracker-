import Link from "next/link";
import { RelativeTime } from "@/components/relative-time";
import { UserAvatar } from "@/components/user-avatar";
import type { FeedEntry } from "@/lib/dal/dashboard";
import { nameOf } from "@/lib/tasks/people";
import { PanelEmpty } from "./panel";

// The important-changes feed (lib/dal/team.ts teamFeed) as phrased rows: who, what, which item, when.

/** "Morgan Lead approved Fix nightly backup · 2 hours ago", with the reason or the date change underneath. */
export function ActivityFeed({ items, now, timeZone, empty }: { items: FeedEntry[]; now: Date; timeZone: string; empty: string }) {
  if (items.length === 0) return <PanelEmpty>{empty}</PanelEmpty>;
  return (
    <ol className="divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 px-4 py-2.5">
          <UserAvatar name={item.actor.name} email={item.actor.email} image={item.actor.image} size="sm" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-5">
              <span className="font-medium">{nameOf(item.actor)}</span> <span className="text-muted-foreground">{item.verb}</span>{" "}
              <Link href={item.subject.href} prefetch={false} className="font-medium break-words underline-offset-4 hover:underline">
                {item.subject.title}
              </Link>
            </p>
            {item.note ? <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{item.note}</p> : null}
          </div>
          <RelativeTime date={new Date(item.at)} now={now} timeZone={timeZone} className="mt-0.5 shrink-0 text-[13px] text-muted-foreground" />
        </li>
      ))}
    </ol>
  );
}
