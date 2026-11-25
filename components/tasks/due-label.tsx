import { cn } from "cn";
import { formatDay, formatDue } from "@/lib/time";
import type { TaskStatusDef } from "@/lib/statuses";

// A due date in words, red only while an open task is overdue. A closed task (completed, rejected,
// cancelled, merged: `isClosedStatus`) is never overdue: its date reads as a plain day.

/** "Tomorrow", "3 days overdue" (red, in words), "Oct 20". `today` comes from the server so both sides agree. */
export function DueLabel({ due, today, status, className }: { due: string | null; today: string; status: TaskStatusDef; className?: string }) {
  if (!due) return null;
  const { text, overdue } = formatDue(due, today);
  return (
    <span className={cn("text-[13px] whitespace-nowrap tabular-nums", overdue && !status.closed ? "font-medium text-status-red-fg" : "text-muted-foreground", className)}>
      {status.closed ? formatDay(due, today) : text}
    </span>
  );
}
