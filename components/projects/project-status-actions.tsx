"use client";

import { Archive, CheckCircle2, RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { setProjectStatus } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/lib/constants";
import { toastResult } from "@/lib/toast-result";

// The project page's status buttons for leaders and admins: Mark completed and Archive, or Reactivate.

/**
 * One click each, no confirmation: every change here is undone by Reactivate, and the project's tasks are never
 * touched. An archived project stops taking new tasks; a completed one can still be archived later.
 */
export function ProjectStatusActions({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const [pending, startTransition] = useTransition();
  const change = (next: ProjectStatus) => startTransition(async () => void toastResult(await setProjectStatus({ projectId, status: next })));

  return (
    <>
      {status === "active" ? (
        <Button variant="outline" disabled={pending} onClick={() => change("completed")}>
          <CheckCircle2 aria-hidden />
          Mark completed
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => change("active")}>
          <RotateCcw aria-hidden />
          Reactivate
        </Button>
      )}
      {status !== "archived" ? (
        <Button variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => change("archived")}>
          <Archive aria-hidden />
          Archive
        </Button>
      ) : null}
    </>
  );
}
