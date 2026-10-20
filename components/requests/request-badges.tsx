import { cn } from "cn";
import { ArrowDown, ArrowRight, CheckCircle2, ChevronUp, ChevronsUp, Inbox, Pause, XCircle, type LucideIcon } from "lucide-react";
import { REQUEST_STATUS_LABELS, REQUEST_URGENCY_LABELS, type RequestStatus, type RequestUrgency } from "@/lib/constants";

// How a request's status and urgency look, everywhere a request is shown. Status reuses the task status tokens so
// the same meaning has the same colour: waiting is blue, a yes is green, later is grey, a no is slate.

const STATUS: Record<RequestStatus, { icon: LucideIcon; tone: string }> = {
  new: { icon: Inbox, tone: "bg-status-in-progress-bg text-status-in-progress-fg" },
  approved: { icon: CheckCircle2, tone: "bg-status-completed-bg text-status-completed-fg" },
  deferred: { icon: Pause, tone: "bg-status-not-started-bg text-status-not-started-fg" },
  rejected: { icon: XCircle, tone: "bg-status-rejected-bg text-status-rejected-fg" },
  converted: { icon: ArrowRight, tone: "bg-status-completed-bg text-status-completed-fg" },
};

export function RequestStatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  const { icon: Icon, tone } = STATUS[status];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium whitespace-nowrap", tone, className)}>
      <Icon className="size-3.5" aria-hidden />
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}

// Urgency is drawn like task priority: critical = red double chevron, high = orange chevron, normal = nothing,
// low = muted down arrow.
const URGENCY: Record<Exclude<RequestUrgency, "normal">, { icon: LucideIcon; size: string; color: string }> = {
  critical: { icon: ChevronsUp, size: "size-4", color: "text-priority-urgent" },
  high: { icon: ChevronUp, size: "size-4", color: "text-priority-high" },
  low: { icon: ArrowDown, size: "size-3.5", color: "text-priority-low" },
};

/** The urgency glyph alone, for dense rows (labelled for screen readers; nothing for normal urgency). */
export function UrgencyGlyph({ urgency, className }: { urgency: RequestUrgency; className?: string }) {
  if (urgency === "normal") return null;
  const { icon: Icon, size, color } = URGENCY[urgency];
  return <Icon role="img" aria-label={`${REQUEST_URGENCY_LABELS[urgency]} urgency`} className={cn("shrink-0", size, color, className)} />;
}

/** The glyph with its word, for the request page's header. Critical and high are coloured; normal and low stay muted. */
export function UrgencyBadge({ urgency, className }: { urgency: RequestUrgency; className?: string }) {
  const glyph = urgency === "normal" ? null : URGENCY[urgency];
  const loud = urgency === "critical" || urgency === "high";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] whitespace-nowrap", loud && glyph ? `font-medium ${glyph.color}` : "text-muted-foreground", className)}>
      {glyph ? <glyph.icon className="size-3.5 shrink-0" aria-hidden /> : null}
      {REQUEST_URGENCY_LABELS[urgency]} urgency
    </span>
  );
}
