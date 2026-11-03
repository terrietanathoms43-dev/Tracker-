"use client";

import { cn } from "cn";
import { GitFork, List } from "lucide-react";
import Link from "next/link";

// List | Branches on the Goals page: two links that keep the rest of the address (the Show completed toggle).

export type GoalsView = "list" | "branches";

export function GoalViewTabs({ active, showAll }: { active: GoalsView; showAll: boolean }) {
  const href = (view: GoalsView) => {
    const params = new URLSearchParams();
    if (view === "branches") params.set("view", "branches");
    if (showAll) params.set("all", "1");
    const query = params.toString();
    return query ? `/goals?${query}` : "/goals";
  };
  const tab = (view: GoalsView, label: string, Icon: typeof List) => (
    <Link
      href={href(view)}
      aria-current={active === view ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active === view ? "bg-background text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Link>
  );
  return (
    <nav aria-label="Goals view" className="inline-flex rounded-md border bg-muted/50 p-0.5">
      {tab("list", "List", List)}
      {tab("branches", "Branches", GitFork)}
    </nav>
  );
}
