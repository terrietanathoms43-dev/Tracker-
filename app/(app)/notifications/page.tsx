import { Bell } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { NotificationRow } from "@/components/notifications/notification-row";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { listNotifications, type NotificationItem } from "@/lib/dal/notifications";
import { safePath } from "@/lib/safe-path";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Notifications" };

/** "Today" is the viewer's calendar day, not the last 24 hours. */
function groupByDay(items: NotificationItem[], now: Date, timeZone: string): { label: string; items: NotificationItem[] }[] {
  const today = dayKey(now, timeZone);
  const isToday = (item: NotificationItem) => dayKey(new Date(item.createdAt), timeZone) === today;
  return [
    { label: "Today", items: items.filter(isToday) },
    { label: "Earlier", items: items.filter((item) => !isToday(item)) },
  ].filter((group) => group.items.length > 0);
}

/** Everything worth telling you, newest first. Each row opens the thing it is about and marks itself read. */
export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const items = await listNotifications(viewer);
  const now = new Date();
  const unread = items.filter((item) => item.readAt === null).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : undefined}
        action={unread > 0 ? <MarkAllReadButton /> : null}
      />
      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up."
          description="Assignments, handovers, approvals, blockers and decisions on your requests show up here."
        />
      ) : (
        <div className="grid gap-6">
          {groupByDay(items, now, viewer.timezone).map((group) => (
            <section key={group.label} aria-labelledby={`notifications-${group.label}`}>
              <h2 id={`notifications-${group.label}`} className="mb-2 text-[13px] font-medium text-muted-foreground">
                {group.label}
              </h2>
              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {group.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={{ id: item.id, title: item.title, body: item.body, href: safePath(item.href, "/home"), unread: item.readAt === null }}
                    time={<RelativeTime date={new Date(item.createdAt)} timeZone={viewer.timezone} now={now} />}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
