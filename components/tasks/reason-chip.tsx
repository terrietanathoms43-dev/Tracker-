import { cn } from "cn";

// The small tag that says why a task is in an attention list.

/** Why a task is in an attention list ("Overdue", "Your approval"): a small muted tag, red for overdue and blocked. */
export function ReasonChip({ reason, className }: { reason: string; className?: string }) {
  const urgent = reason === "Overdue" || reason === "Blocked";
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap",
        urgent ? "bg-status-blocked-bg text-status-blocked-fg" : reason === "Your approval" ? "bg-status-awaiting-bg text-status-awaiting-fg" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {reason}
    </span>
  );
}
