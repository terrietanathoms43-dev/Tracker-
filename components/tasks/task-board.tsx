"use client";

import { useState, useTransition } from "react";
import { changeStatus } from "@/actions/tasks";
import { useStatusCatalog } from "@/components/status-catalog";
import { Group } from "lucide-react";
import { Kanban, KanbanBoard, KanbanColumn, KanbanColumnContent, KanbanOverlay, type KanbanMoveEvent } from "@/components/kanban";
import { StatusIcon } from "@/components/status-badge";
import { RECENTLY_FINISHED_DAYS } from "@/lib/constants";
import { statusDef, type TaskStatusDef } from "@/lib/statuses";
import { boardStatuses, type BoardColumns } from "@/lib/tasks/board";
import { describeGroupCount, groupLabel, groupRuns } from "@/lib/tasks/groups";
import { needsInput } from "@/lib/tasks/transitions";
import { toastResult } from "@/lib/toast-result";
import { useTaskActions } from "./task-actions";
import { TaskCard } from "./task-cards";

// The board (`/tasks?view=board`): five status columns of draggable cards (docs/PLAN.md §5). Dropping a
// card on another column is the card menu's Change status: statuses that need a reason or an approver
// open the transition dialog instead of applying, the rest move straight away and the action's refresh()
// re-renders the board. Order inside a column isn't persisted — the list's sort still owns it — so a card
// dropped back in its own column snaps back. On a phone the columns scroll sideways and snap one at a
// time; dragging is a pointer gesture (touch scroll wins, long-press still opens the action sheet). The tasks of
// one group (2026-11-11 log) stand together in a column, inside one border; a card alone in its column names its
// group on the card instead.
export function TaskBoard({
   columns,
   today,
   statuses,
}: {
   columns: BoardColumns;
   today: string;
   statuses?: TaskStatusDef[];
}) {
   const catalog = useStatusCatalog();
   const offered = statuses ?? boardStatuses(catalog);
   const [live, setLive] = useState<BoardColumns>(columns);
   const [server, setServer] = useState(columns);
   const { openTransition } = useTaskActions();
   const [, startTransition] = useTransition();

   // The action's refresh() re-renders the page with the server's columns — take them as the truth.
   if (server !== columns) {
      setServer(columns);
      setLive(columns);
   }
   const shown = offered.filter((status) => !status.archived || (columns[status.key]?.length ?? 0) > 0);

   function move({ activeContainer, activeIndex, overContainer, overIndex }: KanbanMoveEvent) {
      if (activeContainer === overContainer) return;
      const task = live[activeContainer]?.[activeIndex];
      if (task === undefined) return;
      const toKey = overContainer;
      const to = statusDef(catalog, toKey);
      if (to.archived) return;
      if (needsInput(to)) {
         // The card stays put; the dialog collects what the status needs and saves through the same action.
         openTransition(task.id, toKey);
         return;
      }
      const from = live[activeContainer].filter((_, index) => index !== activeIndex);
      const into = [...(live[toKey] ?? [])];
      into.splice(Math.min(overIndex, into.length), 0, task);
      setLive({ ...live, [activeContainer]: from, [toKey]: into });
      startTransition(async () => {
         const result = await changeStatus({ taskId: task.id, status: toKey });
         if (!toastResult(result)) setLive(columns);
      });
   }

   return (
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6 lg:mx-0 lg:overflow-visible lg:px-0">
         <Kanban value={live} onValueChange={(next) => setLive(next as BoardColumns)} getItemValue={(task) => task.id} onMove={move}>
            <KanbanBoard
               className="flex snap-x snap-mandatory gap-3 lg:grid lg:snap-none"
               style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}
            >
               {shown.map((status) => {
                  const items = live[status.key];
                  return (
                     <KanbanColumn
                        key={status.key}
                        value={status.key}
                        role="region"
                        aria-labelledby={`column-${status.key}`}
                        className="w-[80vw] max-w-72 shrink-0 snap-start rounded-lg bg-muted/50 p-2 transition-all data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-ring/40 data-[over=true]:bg-ring/10 data-[over=true]:ring-ring lg:w-auto lg:max-w-none"
                     >
                        <div className="flex items-center gap-2 px-1 pt-0.5 pb-2">
                           <StatusIcon status={status} />
                           <h2 id={`column-${status.key}`} className="text-sm font-semibold">
                              {status.label}
                           </h2>
                           <span className="text-[13px] text-muted-foreground tabular-nums" aria-label={`${items.length} tasks`}>
                              {items.length}
                           </span>
                           {status.archived ? <span className="ml-auto text-[12px] text-muted-foreground">Archived</span> : null}
                        </div>
                        {items.length === 0 ? (
                           <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">
                              {status.kind === "completed"
                                 ? `Nothing completed in the last ${RECENTLY_FINISHED_DAYS} days.`
                                 : "Nothing here."}
                           </p>
                        ) : (
                           <KanbanColumnContent value={status.key}>
                              {groupRuns(items).map((run) =>
                                 run.group !== null && run.items.length > 1 ? (
                                    <div key={`group-${run.group.id}-${run.items[0].id}`} className="flex flex-col gap-2 rounded-xl border-2 border-primary/35 bg-primary/[0.04] p-1.5" data-task-group={run.group.id}>
                                       {/* A column is narrow: the name gets two lines of its own, the count sits under it. */}
                                       <div className="px-1 text-[12px] leading-snug text-muted-foreground">
                                          <p className="flex items-start gap-1.5">
                                             <Group className="mt-0.5 size-3 shrink-0 text-primary" aria-hidden />
                                             <span className="line-clamp-2 font-medium break-words text-foreground">{groupLabel(run.group)}</span>
                                          </p>
                                          <p className="pl-[18px] tabular-nums">{describeGroupCount(run.items.length, run.group.size)}</p>
                                       </div>
                                       {run.items.map((task) => (
                                          <TaskCard key={task.id} task={task} today={today} inGroup />
                                       ))}
                                    </div>
                                 ) : (
                                    run.items.map((task) => <TaskCard key={task.id} task={task} today={today} />)
                                 ),
                              )}
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
