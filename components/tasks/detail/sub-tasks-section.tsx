"use client";

import { GitMerge } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { describeSubTasks } from "@/lib/tasks/sub-tasks";
import type { TaskListItem } from "@/lib/tasks/types";
import { AttachTaskDialog } from "../attach-task-dialog";
import { QuickAddTask } from "../quick-add-task";
import { TaskList } from "../task-list";

// The Sub-tasks section of a task page (docs/PLAN.md, 2026-11-08 log): the tasks attached to this one, an add bar
// that makes a new one attached here, and "Attach an existing task…" for work that already exists (a duplicate,
// say) and belongs under this one. A sub-task itself has no section: one level only.

export function SubTasksSection({ task, items, today, canEdit, readOnly }: { task: { id: string; projectId: string | null; goalId: string | null }; items: TaskListItem[]; today: string; canEdit: boolean; readOnly: boolean }) {
  const [attaching, setAttaching] = useState(false);
  const open = items.filter((item) => item.status !== "completed" && item.status !== "merged" && item.status !== "cancelled" && item.status !== "rejected" && item.status !== "deferred").length;
  return (
    <section id="sub-tasks" aria-labelledby="sub-tasks-heading" className="scroll-mt-20 rounded-xl border bg-card" data-sub-tasks>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 md:px-6">
        <h2 id="sub-tasks-heading" className="flex items-baseline gap-2 text-base font-semibold">
          Sub-tasks
          <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{items.length}</span>
        </h2>
        <div className="flex items-center gap-2">
          {open > 0 ? <span className="text-[13px] text-muted-foreground">{open} open: this task waits for them.</span> : null}
          {canEdit ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setAttaching(true)} data-attach-existing>
              <GitMerge aria-hidden />
              Attach an existing task…
            </Button>
          ) : null}
        </div>
      </div>
      {canEdit ? (
        <div className="border-b px-5 py-4 md:px-6">
          <QuickAddTask today={today} defaults={{ parentId: task.id, projectId: task.projectId ?? "", goalId: task.goalId ?? "" }} />
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="px-5 py-4 text-base text-muted-foreground md:px-6">No sub-tasks yet. {canEdit ? "Add one above, or attach a task that already exists." : ""}</p>
      ) : (
        <TaskList page={{ items, nextCursor: null }} today={today} showReason={false} readOnly={readOnly} />
      )}
      <p className="sr-only">{describeSubTasks(items.length)}</p>
      {attaching ? <AttachTaskDialog parentId={task.id} excludeIds={[task.id, ...items.map((item) => item.id)]} title="Pick the task that belongs under this one." onClose={() => setAttaching(false)} /> : null}
    </section>
  );
}
