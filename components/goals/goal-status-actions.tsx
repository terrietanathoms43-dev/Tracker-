"use client";

import { CheckCircle2, CirclePause, RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { setGoalStatus } from "@/actions/goals";
import { Button } from "@/components/ui/button";
import type { GoalStatus } from "@/lib/constants";
import { toastResult } from "@/lib/toast-result";

// The goal page's status buttons for leaders and admins: Mark achieved and Pause while active, Reactivate otherwise.

/**
 * One click each, no confirmation: every change here is undone by Reactivate, and nothing under the goal is touched
 * (its projects and tasks keep their links and history).
 */
export function GoalStatusActions({ goalId, status }: { goalId: string; status: GoalStatus }) {
  const [pending, startTransition] = useTransition();
  const change = (next: GoalStatus) => startTransition(async () => void toastResult(await setGoalStatus({ goalId, status: next })));

  if (status !== "active") {
    return (
      <Button variant="outline" disabled={pending} onClick={() => change("active")}>
        <RotateCcw aria-hidden />
        Reactivate
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" disabled={pending} onClick={() => change("achieved")}>
        <CheckCircle2 aria-hidden />
        Mark achieved
      </Button>
      <Button variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => change("paused")}>
        <CirclePause aria-hidden />
        Pause
      </Button>
    </>
  );
}
