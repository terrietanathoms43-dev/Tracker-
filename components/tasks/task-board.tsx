"use client";

import { useState, useTransition } from "react";
import { changeStatus } from "@/actions/tasks";
import { Kanban, KanbanBoard, KanbanColumn, KanbanColumnContent, KanbanOverlay, type KanbanMoveEvent } from "@/components/kanban";
import { StatusIcon } from "@/components/status-badge";
import { RECENTLY_FINISHED_DAYS, TASK_STATUS_LABELS } from "@/lib/constants";
import { BOARD_STATUSES, type BoardColumns, type BoardStatus } from "@/lib/tasks/board";
import { needsInput } from "@/lib/tasks/transitions";
import { toastResult } from "@/lib/toast-result";
import { useTaskActions } from "./task-actions";
import { TaskCard } from "./task-cards";

// The board (`/tasks?view=board`): five status columns of draggable cards (docs/PLAN.md §5). Dropping a
// card on another column is the card menu's Change status: statuses that need a reason or an approver
// open the transition dialog instead of applying, the rest move straight away and the action's refresh()
// re-renders the board. Order inside a column isn't persisted — the list's sort still owns it — so a card
// dropped back in its own column snaps back. On a phone the columns scroll sideways and snap one at a
// time; dragging is a pointer gesture (touch scroll wins, long-press still opens the action sheet).
export function TaskBoard({
   columns,
   today,
   statuses = BOARD_STATUSES,
}: {
   columns: BoardColumns;
   today: string;
   statuses?: readonly BoardStatus[];
}) {
   const [live, setLive] = useState<BoardColumns>(columns);
   const [server, setServer] = useState(columns);
   const { openTransition } = useTaskActions();
   const [, startTransition] = useTransition();

   // The action's refresh() re-renders the page with the server's columns — take them as the truth.
   if (server !== columns) {
      setServer(columns);
      setLive(columns);
   }

   function move({ activeContainer, activeIndex, overContainer, overIndex }: KanbanMoveEvent) {
      if (activeContainer === overContainer) return;
      const task = live[activeContainer as BoardStatus]?.[activeIndex];
      if (task === undefined) return;
      const to = overContainer as BoardStatus;
      if (needsInput(to)) {
         // The card stays put; the dialog collects what the status needs and saves through the same action.
         openTransition(task.id, to);
         return;
      }
      const from = live[activeContainer as BoardStatus].filter((_, index) => index !== activeIndex);
      const into = [...(live[to] ?? [])];
      into.splice(Math.min(overIndex, into.length), 0, task);
      setLive({ ...live, [activeContainer]: from, [to]: into });
      startTransition(async () => {
         const result = await changeStatus({ taskId: task.id, status: to });
         if (!toastResult(result)) setLive(columns);
      });
   }

   return (
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6 lg:mx-0 lg:overflow-visible lg:px-0">
         <Kanban value={live} onValueChange={(next) => setLive(next as BoardColumns)} getItemValue={(task) => task.id} onMove={move}>
            <KanbanBoard
               className="flex snap-x snap-mandatory gap-3 lg:grid lg:snap-none"
               style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(0, 1fr))` }}
            >
               {statuses.map((status) => {
                  const items = live[status];
                  return (
                     <KanbanColumn
                        key={status}
                        value={status}
                        role="region"
                        aria-labelledby={`column-${status}`}
                        className="w-[80vw] max-w-72 shrink-0 snap-start rounded-lg bg-muted/50 p-2 transition-all data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-ring/40 data-[over=true]:bg-ring/10 data-[over=true]:ring-ring lg:w-auto lg:max-w-none"
                     >
                        <div className="flex items-center gap-2 px-1 pt-0.5 pb-2">
                           <StatusIcon status={status} />
                           <h2 id={`column-${status}`} className="text-[13px] font-semibold">
                              {TASK_STATUS_LABELS[status]}
                           </h2>
                           <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${items.length} tasks`}>
                              {items.length}
                           </span>
                        </div>
                        {items.length === 0 ? (
                           <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                              {status === "completed"
                                 ? `Nothing completed in the last ${RECENTLY_FINISHED_DAYS} days.`
                                 : "Nothing here."}
                           </p>
                        ) : (
                           <KanbanColumnContent value={status}>
                              {items.map((task) => (
                                 <TaskCard key={task.id} task={task} today={today} />
                              ))}
                           </KanbanColumnContent>
                        )}
                     </KanbanColumn>
                  );
               })}
            </KanbanBoard>
            <KanbanOverlay>
               {({ value }) => {
                  const task = Object.values(live)
                     .flat()
                     .find((item) => item.id === value);
                  return task ? <TaskCard task={task} today={today} overlay /> : null;
               }}
            </KanbanOverlay>
         </Kanban>
      </div>
   );
}
