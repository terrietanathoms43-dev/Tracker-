"use client";

import { cn } from "cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { markNotificationRead } from "@/actions/notifications";

// One notification: a real link to what it is about. Opening an unread one marks it read first, from here,
// because that is the one place that knows a notification was opened (the page it leads to belongs to
// another feature). The action refresh()es, so the shell's unread count is already right when the next page
// shows. Opening it in a new tab still marks it read, without waiting.

export type NotificationRowData = { id: string; title: string; body: string | null; href: string; unread: boolean };

export function NotificationRow({ item, time }: { item: NotificationRowData; time: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <li>
      <Link
        href={item.href}
        aria-busy={pending || undefined}
        onClick={(event) => {
          if (!item.unread) return;
          const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;
          if (newTab) {
            void markNotificationRead({ id: item.id });
            return;
          }
          event.preventDefault();
          startTransition(async () => {
            await markNotificationRead({ id: item.id });
            router.push(item.href);
          });
        }}
        className="flex items-start gap-3 px-3 py-2.5 transition-colors outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4"
      >
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.unread ? "bg-highlight" : "bg-transparent")}>
          {item.unread ? <span className="sr-only">Unread: </span> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", item.unread ? "font-semibold" : "font-medium text-muted-foreground")}>{item.title}</span>
          {item.body ? <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted-foreground">{item.body}</span> : null}
        </span>
        <span className="shrink-0 pt-px text-[13px] text-muted-foreground">{time}</span>
      </Link>
    </li>
  );
}
