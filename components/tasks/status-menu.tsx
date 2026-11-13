"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import { changeStatus } from "@/actions/tasks";
import { StatusIcon } from "@/components/status-badge";
import { useStatusCatalog } from "@/components/status-catalog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { activeStatuses, requiresEditToEnter, type TaskStatusDef } from "@/lib/statuses";
import { needsInput } from "@/lib/tasks/transitions";
import { toastResult } from "@/lib/toast-result";
import { useTaskActions } from "./task-actions";

// Quick status changes (apex-ux §5): one click when the status needs nothing, the small dialog when it does.

/** Moves a task to a status: straight away, or through the transition dialog for the fields that status needs. */
export function useChangeStatus(taskId: string) {
  const { openTransition } = useTaskActions();
  const [pending, startTransition] = useTransition();
  const change = (current: string, to: TaskStatusDef) => {
    if (to.key === current) return;
    if (needsInput(to)) openTransition(taskId, to.key);
    else startTransition(async () => void toastResult(await changeStatus({ taskId, status: to.key })));
  };
  return { change, pending };
}

/** The statuses as dropdown items (inside a DropdownMenuContent or a sub-menu), the current one ticked. Rejecting and cancelling need edit rights. */
export function StatusMenuItems({ current, onPick, allowReject = true, hasParent = false }: { current: string; onPick: (status: TaskStatusDef) => void; allowReject?: boolean; hasParent?: boolean }) {
  const catalog = useStatusCatalog();
  return (
    <>
      {activeStatuses(catalog)
        .filter((status) => (allowReject || !requiresEditToEnter(status) || status.key === current) && (status.kind !== "merged" || hasParent || status.key === current))
        .map((status) => (
          <DropdownMenuItem key={status.key} onSelect={() => onPick(status)} className="gap-2">
            <StatusIcon status={status} />
            {status.label}
            {status.key === current ? <Check className="ml-auto size-4" aria-label="Current" /> : null}
          </DropdownMenuItem>
        ))}
    </>
  );
}
