"use client";

import { cn } from "cn";
import Link from "next/link";
import { useState } from "react";
import { PriorityGlyph } from "@/components/priority-glyph";
import { StatusIcon } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { nameOf } from "@/lib/tasks/people";
import type { TaskListItem } from "@/lib/tasks/types";
import { DueLabel } from "./due-label";
import { ReasonChip } from "./reason-chip";
import { TaskActionSheet, TaskMenu } from "./task-menu";
import { useLongPress } from "./use-long-press";

// One dense task row with its quick actions.

/**
 * One dense row (apex-ui list row): status · title · next action · reason · due · priority · assignee, the whole
 * row a link, with a hover "⋯" menu on desktop and a long-press sheet on touch. `readOnly` drops the actions
 * (a stakeholder following their request's task).
 */
export function TaskRow({ task, today, showReason = true, readOnly = false }: { task: TaskListItem; today: string; showReason?: boolean; readOnly?: boolean }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { handlers, swallowClick } = useLongPress(() => setSheetOpen(true));
  const rejected = task.status === "rejected";
  // "Overdue" is already said by the red due label, so that chip would say it twice.
  const reason = showReason && task.reason !== "Overdue" ? task.reason : undefined;

  return (
    <li className="group relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60 sm:px-4" {...handlers}>
      <StatusIcon status={task.status} />
      <Link
        href={`/tasks/${task.id}`}
        prefetch={false}
        data-task-link
        onClick={swallowClick}
        className="flex min-w-0 flex-1 flex-col gap-0.5 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring md:flex-row md:items-baseline md:gap-3"
      >
        <span className={cn("truncate text-[13px] font-medium md:max-w-[55%] md:shrink-0", rejected && "text-muted-foreground line-through")}>{task.title}</span>
        {task.nextAction || reason ? (
          <span className="flex min-w-0 items-center gap-1.5">
            {/* On a phone the reason leads the second line; from sm up it sits beside the due date. */}
            {reason ? <ReasonChip reason={reason} className="sm:hidden" /> : null}
            {task.nextAction ? <span className="truncate text-xs text-muted-foreground md:text-[13px]">{task.nextAction}</span> : null}
          </span>
        ) : null}
      </Link>
      {reason ? <ReasonChip reason={reason} className="relative hidden sm:inline-flex" /> : null}
      <DueLabel due={task.dueDate} today={today} status={task.status} className="relative shrink-0" />
      <PriorityGlyph priority={task.priority} className="relative" />
      {task.assignee ? (
        <span className="relative shrink-0" title={nameOf(task.assignee)}>
          <UserAvatar name={task.assignee.name} email={task.assignee.email} image={task.assignee.image} size="sm" />
        </span>
      ) : (
        <span className="relative size-6 shrink-0 rounded-full border border-dashed" title="Unassigned" aria-label="Unassigned" role="img" />
      )}
      {readOnly ? null : (
        <TaskMenu
          task={task}
          className="hidden opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 md:grid"
        />
      )}
      <TaskActionSheet task={task} open={sheetOpen} onOpenChange={setSheetOpen} readOnly={readOnly} />
    </li>
  );
}
