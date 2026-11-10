"use client";

import { cn } from "cn";
import { ClipboardCheck, CornerDownRight, GitMerge } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { KanbanItem, KanbanItemHandle } from "@/components/kanban";
import { PriorityGlyph } from "@/components/priority-glyph";
import { describeSubTasks } from "@/lib/tasks/sub-tasks";
import type { TaskListItem } from "@/lib/tasks/types";
import { AssigneeStack } from "./assignee-stack";
import { CloserChip } from "./closer-chip";
import { DueLabel } from "./due-label";
import { TaskActionSheet, TaskMenu } from "./task-menu";
import { useLongPress } from "./use-long-press";

// A compact task card for a board column: title, next action, due, priority and assignee, with a "⋯"
// menu and the long-press action sheet. The whole card is the drag handle — 10px of movement starts a
// drag, less stays a click — so the stretched title link still opens the task.
export function TaskCard({
   task,
   today,
   readOnly = false,
   overlay = false,
}: {
   task: TaskListItem;
   today: string;
   readOnly?: boolean;
   overlay?: boolean;
}) {
   const [sheetOpen, setSheetOpen] = useState(false);
   const { handlers, swallowClick } = useLongPress(() => setSheetOpen(true));
   return (
      <KanbanItem value={task.id} disabled={readOnly}>
         <KanbanItemHandle
            cursor={!overlay}
            className={cn(
               "group relative block rounded-lg border bg-card p-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
               overlay ? "rotate-1 shadow-lg ring-2 ring-ring/30" : "hover:bg-accent/60",
            )}
         >
            <div {...(overlay ? {} : handlers)}>
               <div className="flex items-start gap-2">
                  <Link
                     href={`/tasks/${task.id}`}
                     prefetch={false}
                     data-task-link
                     onClick={swallowClick}
                     className="line-clamp-3 min-w-0 flex-1 text-sm leading-snug font-medium outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
                  >
                     {task.title}
                  </Link>
                  {readOnly || overlay ? null : <TaskMenu task={task} className="-mt-1 -mr-1 size-6" />}
               </div>
               {task.proposal === "pending" || task.proposal === "declined" ? (
                  <span className={cn("mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", task.proposal === "pending" ? "bg-status-awaiting-bg text-status-awaiting-fg" : "bg-status-blocked-bg text-status-blocked-fg")}>
                     <ClipboardCheck className="size-3" aria-hidden />
                     {task.proposal === "pending" ? "Waiting for sign-off" : "Declined"}
                  </span>
               ) : null}
               {task.goalCloser && task.goal ? <CloserChip goal={task.goal} variant="card" className="mt-1" /> : null}
               {task.parent !== null ? (
                  <p className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground" data-part-of-chip>
                     <CornerDownRight className="size-3 shrink-0" aria-hidden />
                     <span className="truncate">Part of {task.parent.title}</span>
                  </p>
               ) : null}
               {task.subTasks > 0 ? (
                  <p className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground" data-sub-tasks-chip>
                     <GitMerge className="size-3 shrink-0" aria-hidden />
                     {describeSubTasks(task.subTasks)}
                  </p>
               ) : null}
               {task.nextAction ? <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">{task.nextAction}</p> : null}
               <div className="mt-2.5 flex items-center gap-2">
                  <DueLabel due={task.dueDate} today={today} status={task.status} />
                  <PriorityGlyph priority={task.priority} className="relative" />
                  <span className="ml-auto" />
                  <AssigneeStack assignees={task.assignees} className="relative" />
               </div>
               {overlay ? null : <TaskActionSheet task={task} open={sheetOpen} onOpenChange={setSheetOpen} readOnly={readOnly} />}
            </div>
         </KanbanItemHandle>
      </KanbanItem>
   );
}
