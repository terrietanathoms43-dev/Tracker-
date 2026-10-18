import { cn } from "cn";
import Link from "next/link";
import { tasksHref } from "@/lib/tasks/filters";
import type { TaskCounts } from "@/lib/tasks/types";

// The five operational counts on Team and on a leader's Home. Each tile is a link to the tasks it counts.

type Tile = { key: keyof TaskCounts; label: string; href: string; problem: boolean };

/**
 * Active · Completed in the period · Overdue · Blocked · Awaiting approval. Facts, never ratings: overdue and
 * blocked are tinted only when they are above zero, with the status tokens, and nothing else is coloured.
 */
export function CountTiles({ counts, days }: { counts: TaskCounts; days: number }) {
  const tiles: Tile[] = [
    { key: "active", label: "Active", href: tasksHref({}), problem: false },
    { key: "completed", label: `Completed · ${days} days`, href: tasksHref({ status: ["completed"], sort: "updated" }), problem: false },
    { key: "overdue", label: "Overdue", href: tasksHref({ due: "overdue" }), problem: true },
    { key: "blocked", label: "Blocked", href: tasksHref({ status: ["blocked"] }), problem: true },
    { key: "awaiting", label: "Awaiting approval", href: tasksHref({ status: ["awaiting_approval"] }), problem: false },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Work in numbers">
      {tiles.map(({ key, label, href, problem }, index) => {
        const value = counts[key];
        const tinted = problem && value > 0;
        return (
          // On a phone the first tile takes the whole row, so five tiles sit in three even rows.
          <li key={key} className={cn(index === 0 && "col-span-2 sm:col-span-1")}>
            <Link
              href={href}
              className={cn(
                "block rounded-lg border px-4 py-3 transition-colors",
                tinted ? "border-status-blocked-dot/30 bg-status-blocked-bg hover:bg-status-blocked-bg/70" : "bg-card hover:bg-accent/60",
              )}
            >
              <p className={cn("truncate text-xs", tinted ? "text-status-blocked-fg" : "text-muted-foreground")}>{label}</p>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tinted && "text-status-blocked-fg")}>{value}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
