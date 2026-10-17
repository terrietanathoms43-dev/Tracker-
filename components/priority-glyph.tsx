import { cn } from "cn";
import { ArrowDown, ChevronUp, ChevronsUp } from "lucide-react";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";

/** urgent = red double chevron, high = orange chevron, normal = nothing, low = muted down arrow. */
export function PriorityGlyph({ priority, className }: { priority: TaskPriority; className?: string }) {
  if (priority === "normal") return null;
  const a11y = { "aria-label": `${TASK_PRIORITY_LABELS[priority]} priority`, role: "img" as const };
  if (priority === "urgent") return <ChevronsUp {...a11y} className={cn("size-4 shrink-0 text-priority-urgent", className)} />;
  if (priority === "high") return <ChevronUp {...a11y} className={cn("size-4 shrink-0 text-priority-high", className)} />;
  return <ArrowDown {...a11y} className={cn("size-3.5 shrink-0 text-priority-low", className)} />;
}
