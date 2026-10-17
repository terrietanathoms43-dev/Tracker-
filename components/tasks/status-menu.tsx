"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import { changeStatus } from "@/actions/tasks";
import { StatusIcon } from "@/components/status-badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@/lib/constants";
import { needsInput } from "@/lib/tasks/transitions";
import { toastResult } from "@/lib/toast-result";
import { useTaskActions } from "./task-actions";

// Quick status changes (apex-ux §5): one click when the status needs nothing, the small dialog when it does.

/** Moves a task to a status: straight away, or through the transition dialog for the fields that status needs. */
export function useChangeStatus(taskId: string) {
  const { openTransition } = useTaskActions();
  const [pending, startTransition] = useTransition();
  const change = (current: TaskStatus, to: TaskStatus) => {
    if (to === current) return;
    if (needsInput(to)) openTransition(taskId, to);
    else startTransition(async () => void toastResult(await changeStatus({ taskId, status: to })));
  };
  return { change, pending };
}

/** The six statuses as dropdown items (inside a DropdownMenuContent or a sub-menu), the current one ticked. */
export function StatusMenuItems({ current, onPick, allowReject = true }: { current: TaskStatus; onPick: (status: TaskStatus) => void; allowReject?: boolean }) {
  return (
    <>
      {TASK_STATUSES.filter((status) => allowReject || status !== "rejected" || status === current).map((status) => (
        <DropdownMenuItem key={status} onSelect={() => onPick(status)} className="gap-2">
          <StatusIcon status={status} />
          {TASK_STATUS_LABELS[status]}
          {status === current ? <Check className="ml-auto size-4" aria-label="Current" /> : null}
        </DropdownMenuItem>
      ))}
    </>
  );
}
