import { cn } from "cn";
import { createElement } from "react";
import { iconFor, TONE_CLASSES, type TaskStatusDef } from "@/lib/statuses";

// Every status rendering reads the workspace's resolved def (icon, tone, label) — lib/statuses.ts.

/** The status icon alone, for dense list rows (labelled for screen readers). */
export function StatusIcon({ status, className }: { status: TaskStatusDef; className?: string }) {
  return createElement(iconFor(status.icon), { className: cn("size-4 shrink-0", TONE_CLASSES[status.tone].dot, className), "aria-label": status.label, role: "img" });
}

export function StatusBadge({ status, className }: { status: TaskStatusDef; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium whitespace-nowrap", TONE_CLASSES[status.tone].badge, className)}>
      {createElement(iconFor(status.icon), { className: "size-3.5", "aria-hidden": true })}
      {status.label}
    </span>
  );
}
