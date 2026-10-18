"use client";

import { cn } from "cn";
import Link from "next/link";
import { useState } from "react";
import { PriorityGlyph } from "@/components/priority-glyph";
import type { TaskListItem } from "@/lib/tasks/types";
import { AssigneeStack } from "./assignee-stack";
import { DueLabel } from "./due-label";
import { TaskActionSheet, TaskMenu } from "./task-menu";
import { useLongPress } from "./use-long-press";

// Compact task cards for a board column or a status group.

function TaskCard({ task, today, readOnly }: { task: TaskListItem; today: string; readOnly: boolean }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { handlers, swallowClick } = useLongPress(() => setSheetOpen(true));
  return (
    <li className="group relative rounded-lg border bg-card p-3 transition-colors hover:bg-accent/60" {...handlers}>
      <div className="flex items-start gap-2">
        <Link
          href={`/tasks/${task.id}`}
          prefetch={false}
          data-task-link
          onClick={swallowClick}
          className="line-clamp-3 min-w-0 flex-1 text-[13px] leading-snug font-medium outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {task.title}
        </Link>
        {readOnly ? null : <TaskMenu task={task} className="-mt-1 -mr-1 size-6" />}
      </div>
      {task.nextAction ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{task.nextAction}</p> : null}
      <div className="mt-2.5 flex items-center gap-2">
        <DueLabel due={task.dueDate} today={today} status={task.status} />
        <PriorityGlyph priority={task.priority} className="relative" />
        <span className="ml-auto" />
        <AssigneeStack assignees={task.assignees} className="relative" />
      </div>
      <TaskActionSheet task={task} open={sheetOpen} onOpenChange={setSheetOpen} readOnly={readOnly} />
    </li>
  );
}

/**
 * Compact cards for one status (a board column, or a project page's status group): title, next action, due,
 * priority and assignee, with a "⋯" menu to change status. No drag and drop (docs/PLAN.md §5).
 */
export function TaskCards({ items, today, readOnly = false, className }: { items: TaskListItem[]; today: string; readOnly?: boolean; className?: string }) {
  return (
    <ul className={cn("grid gap-2", className)}>
      {items.map((task) => (
        <TaskCard key={task.id} task={task} today={today} readOnly={readOnly} />
      ))}
    </ul>
  );
}
