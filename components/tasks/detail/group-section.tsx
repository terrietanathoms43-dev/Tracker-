"use client";

import { Group, Plus, Ungroup } from "lucide-react";
import { useState, useTransition } from "react";
import { ungroupTask } from "@/actions/task-groups";
import { Button } from "@/components/ui/button";
import { groupLabel } from "@/lib/tasks/groups";
import type { TaskGroupRef, TaskListItem } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";
import { AttachTaskDialog } from "../attach-task-dialog";
import { GroupMenu } from "../task-group";
import { TaskList } from "../task-list";

// The Group section of a task page (docs/PLAN.md, 2026-11-11 log): the tasks this one is grouped with. They are
// equals (not sub-tasks: those have their own section), and every list that shows two or more of them draws them
// side by side inside one border; here the border is the section. People who may edit the task can add another
// task to the group or take this one out; Rename and Ungroup all are on the "⋯".

export function GroupSection({
  task,
  group,
  others,
  today,
  canEdit,
  readOnly,
}: {
  task: { id: string; title: string };
  group: TaskGroupRef;
  /** The rest of the group, this task aside. */
  others: TaskListItem[];
  today: string;
  canEdit: boolean;
  readOnly: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <section id="group" aria-labelledby="group-heading" className="scroll-mt-20 overflow-hidden rounded-xl border-2 border-primary/35 bg-card" data-group-section={group.id}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 bg-primary/[0.07] px-5 py-3 md:px-6">
        <h2 id="group-heading" className="flex min-w-0 items-center gap-2 text-base font-semibold">
          <Group className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{group.name ? `Group: ${groupLabel(group)}` : "Grouped with"}</span>
          <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{group.size} tasks</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)} data-group-add>
                <Plus aria-hidden />
                Add a task…
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(async () => void toastResult(await ungroupTask({ taskId: task.id })))} data-group-leave>
                <Ungroup aria-hidden />
                {pending ? "Removing…" : "Remove this task"}
              </Button>
            </>
          ) : null}
          {readOnly ? null : <GroupMenu group={group} />}
        </div>
      </div>
      <p className="border-b px-5 py-2 text-[13px] text-muted-foreground md:px-6">On the same level as this task: wherever a list shows more than one of them, they sit together inside one border.</p>
      {others.length === 0 ? (
        <p className="px-5 py-4 text-base text-muted-foreground md:px-6">The other tasks in this group are not ones you can see.</p>
      ) : (
        <TaskList page={{ items: others, nextCursor: null }} today={today} showReason={false} readOnly={readOnly} plain />
      )}
      {adding ? <AttachTaskDialog mode="group" intoOwnGroup taskIds={[task.id]} excludeIds={[task.id, ...others.map((item) => item.id)]} title={task.title} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}
