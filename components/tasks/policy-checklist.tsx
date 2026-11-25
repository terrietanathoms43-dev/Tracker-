"use client";

import { Check, Circle } from "lucide-react";
import { useState, useTransition } from "react";
import { setPolicyChecklistItem } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { incompletePolicyCount, type TaskPolicyItem } from "@/lib/tasks/policy-checklist";
import { toastResult } from "@/lib/toast-result";

export function PolicyChecklist({ taskId, items, editable }: { taskId: string; items: TaskPolicyItem[]; editable: boolean }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (items.length === 0) return null;
  const remaining = incompletePolicyCount(items);

  function toggle(item: TaskPolicyItem) {
    setPendingId(item.id);
    startTransition(async () => {
      toastResult(await setPolicyChecklistItem({ taskId, itemId: item.id, checked: item.checkedAt === null }));
      setPendingId(null);
    });
  }

  return (
    <section aria-label="Task policy checklist" className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">Required policy checks</h3>
        <span className={remaining === 0 ? "text-[12px] font-medium text-status-completed-fg" : "text-[12px] text-muted-foreground"}>
          {remaining === 0 ? "All checks met" : `${items.length - remaining} of ${items.length} met`}
        </span>
      </div>
      <ul className="grid gap-1.5">
        {items.map((item) => {
          const checked = item.checkedAt !== null;
          const disabled = !editable || pendingId !== null;
          return (
            <li key={item.id}>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-2 whitespace-normal px-2 py-2 text-left"
                disabled={disabled}
                aria-pressed={checked}
                onClick={() => toggle(item)}
              >
                {checked ? <Check className="size-4 shrink-0 text-status-completed-dot" aria-hidden /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                <span className={checked ? "flex-1 text-muted-foreground line-through" : "flex-1"}>{item.label}</span>
                {checked ? <span className="shrink-0 text-[11px] text-muted-foreground">Met</span> : null}
              </Button>
            </li>
          );
        })}
      </ul>
      {editable ? <p className="mt-2 text-[12px] text-muted-foreground">Mark each requirement met before sending this task for approval.</p> : null}
      {!editable && remaining > 0 ? <p className="mt-2 text-[12px] text-status-awaiting-fg">Approval is held until every policy check is met.</p> : null}
    </section>
  );
}
