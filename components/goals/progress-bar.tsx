import { cn } from "cn";

// Completed out of total tasks as a thin bar with the counts in words. Shared by goals, projects, Home and Team,
// and safe to render on the server or inside a client component (no hooks).

/**
 * "4 of 9 tasks completed", a gold bar (the one place gold means progress, docs/PLAN.md §9), and "2 blocked ·
 * 1 overdue" when there is trouble. Counts only: never a percentage invented from task counts (apex-ux §8).
 * `size="lg"` is the goal and project pages' header version.
 */
export function ProgressBar({
  completed,
  total,
  blocked = 0,
  overdue = 0,
  size = "sm",
  className,
}: {
  completed: number;
  total: number;
  blocked?: number;
  overdue?: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  const large = size === "lg";
  const trouble = [blocked > 0 ? `${blocked} blocked` : null, overdue > 0 ? `${overdue} overdue` : null].filter((part) => part !== null);
  const width = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className={className}>
      <div className={cn("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5", large ? "text-sm" : "text-xs")}>
        <p className="text-muted-foreground">
          {total === 0 ? (
            "No tasks yet"
          ) : (
            <>
              <span className={cn("font-medium text-foreground tabular-nums", large && "text-base")}>{completed}</span> of{" "}
              <span className="tabular-nums">{total}</span> {total === 1 ? "task" : "tasks"} completed
            </>
          )}
        </p>
        {trouble.length > 0 ? <p className="font-medium text-status-blocked-fg tabular-nums">{trouble.join(" · ")}</p> : null}
      </div>
      <div className={cn("overflow-hidden rounded-full bg-muted", large ? "mt-2 h-2.5" : "mt-1.5 h-1.5")} aria-hidden>
        <div className="h-full rounded-full bg-highlight transition-[width]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
