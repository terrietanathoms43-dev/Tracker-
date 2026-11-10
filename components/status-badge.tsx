import { cn } from "cn";
import { Ban, CheckCircle2, Circle, CircleDot, CirclePause, Clock, GitMerge, OctagonAlert, XCircle, type LucideIcon } from "lucide-react";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/constants";

// One table maps each status to its icon and tokens (Apex UI §4, §6); every status rendering reads it.
const STYLES: Record<TaskStatus, { icon: LucideIcon; badge: string; dot: string }> = {
  not_started: { icon: Circle, badge: "bg-status-not-started-bg text-status-not-started-fg", dot: "text-status-not-started-dot" },
  in_progress: { icon: CircleDot, badge: "bg-status-in-progress-bg text-status-in-progress-fg", dot: "text-status-in-progress-dot" },
  awaiting_approval: { icon: Clock, badge: "bg-status-awaiting-bg text-status-awaiting-fg", dot: "text-status-awaiting-dot" },
  blocked: { icon: OctagonAlert, badge: "bg-status-blocked-bg text-status-blocked-fg", dot: "text-status-blocked-dot" },
  deferred: { icon: CirclePause, badge: "bg-status-deferred-bg text-status-deferred-fg", dot: "text-status-deferred-dot" },
  rejected: { icon: XCircle, badge: "bg-status-rejected-bg text-status-rejected-fg", dot: "text-status-rejected-dot" },
  cancelled: { icon: Ban, badge: "bg-status-cancelled-bg text-status-cancelled-fg", dot: "text-status-cancelled-dot" },
  merged: { icon: GitMerge, badge: "bg-status-merged-bg text-status-merged-fg", dot: "text-status-merged-dot" },
  completed: { icon: CheckCircle2, badge: "bg-status-completed-bg text-status-completed-fg", dot: "text-status-completed-dot" },
};

/** The status icon alone, for dense list rows (labelled for screen readers). */
export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const { icon: Icon, dot } = STYLES[status];
  return <Icon className={cn("size-4 shrink-0", dot, className)} aria-label={TASK_STATUS_LABELS[status]} role="img" />;
}

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const { icon: Icon, badge } = STYLES[status];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium whitespace-nowrap", badge, className)}>
      <Icon className="size-3.5" aria-hidden />
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}
