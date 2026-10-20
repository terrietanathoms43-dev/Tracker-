import { cn } from "cn";
import { Bell } from "lucide-react";
import Link from "next/link";

/** Sidebar row or phone icon linking to /notifications; the unread count is the one gold badge in the shell. */
export function NotificationBell({ unread, variant = "row" }: { unread: number; variant?: "row" | "icon" }) {
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  if (variant === "icon") {
    return (
      <Link href="/notifications" aria-label={label} className="relative grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <Bell className="size-5" aria-hidden />
        {unread > 0 ? <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-highlight ring-2 ring-background" /> : null}
      </Link>
    );
  }
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")}
    >
      <Bell className="size-4 shrink-0" aria-hidden />
      Notifications
      {unread > 0 ? (
        <span className="ml-auto rounded-md bg-highlight px-1.5 text-xs font-semibold tabular-nums text-highlight-foreground">{unread > 99 ? "99+" : unread}</span>
      ) : null}
    </Link>
  );
}
