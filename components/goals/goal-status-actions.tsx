"use client";

import { CheckCircle2, CirclePause, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { setGoalStatus } from "@/actions/goals";
import { Button } from "@/components/ui/button";
import type { GoalStatus } from "@/lib/constants";

// The goal page's status buttons: Mark completed for admins, leaders and stakeholders (the people who sign a goal
// off), Pause for whoever manages planning, Reactivate for whoever may undo the state it is in.

/**
 * One click each, no confirmation: every change here is undone by Reactivate, and nothing under the goal is touched
 * (its tasks keep their links and history). Completing a repeating goal makes the next one, and the toast says so.
 */
export function GoalStatusActions({ goalId, status, canComplete, canManage, loud = false }: { goalId: string; status: GoalStatus; canComplete: boolean; canManage: boolean; loud?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const change = (next: GoalStatus) =>
    startTransition(async () => {
      const result = await setGoalStatus({ goalId, status: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const created = result.data.next;
      if (created) toast.success(result.message ?? "Goal completed.", { action: { label: "Open the next one", onClick: () => router.push(`/goals/${created.id}`) } });
      else toast.success(result.message ?? "Saved.");
    });

  if (status === "completed") {
    if (!canComplete) return null;
    return (
      <Button variant="outline" disabled={pending} onClick={() => change("active")}>
        <RotateCcw aria-hidden />
        Reopen
      </Button>
    );
  }
  if (status === "paused") {
    if (!canManage) return null;
    return (
      <Button variant="outline" disabled={pending} onClick={() => change("active")}>
        <RotateCcw aria-hidden />
        Reactivate
      </Button>
    );
  }
  return (
    <>
      {canComplete ? (
        <Button variant={loud ? "default" : "outline"} disabled={pending} onClick={() => change("completed")}>
          <CheckCircle2 aria-hidden />
          Mark completed
        </Button>
      ) : null}
      {canManage ? (
        <Button variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => change("paused")}>
          <CirclePause aria-hidden />
          Pause
        </Button>
      ) : null}
    </>
  );
}
