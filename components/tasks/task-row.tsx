"use client";

import { cn } from "cn";
import { ChevronDown, ClipboardCheck, Repeat } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { PriorityGlyph } from "@/components/priority-glyph";
import { StatusIcon } from "@/components/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PROPOSAL_STATUS_LABELS } from "@/lib/constants";
import { describeAssignees } from "@/lib/tasks/assignees";
import type { TaskListItem } from "@/lib/tasks/types";
import { formatTime } from "@/lib/recurrence";
import { AssigneeStack } from "./assignee-stack";
import { DueLabel } from "./due-label";
import { ReasonChip } from "./reason-chip";
import { useTaskSelection } from "./selection";
import { TaskActionSheet, TaskMenu } from "./task-menu";
import { useLongPress } from "./use-long-press";

// One dense task row that opens up in place (docs/PLAN.md, 2026-11-03 log): the title is the link to the task
// page; clicking anywhere else on the row shows the description, who is on it, where it sits and what happened
// last, so the facts are a glance away without leaving the list.

/** Anything inside the row that handles its own click (links, buttons, the menu's portal) must not toggle the row. */
const interactive = (event: MouseEvent) => (event.target as HTMLElement).closest("a, button, input, [role=menu], [role=dialog], [data-no-expand]") !== null;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

/**
 * One dense row (apex-ui list row): status · title · next action · reason · due · priority · assignees, with a
 * hover "⋯" menu on desktop and a long-press sheet on touch. `readOnly` drops the actions (a stakeholder reading).
 */
export function TaskRow({ task, today, showReason = true, readOnly = false }: { task: TaskListItem; today: string; showReason?: boolean; readOnly?: boolean }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const { handlers, swallowClick } = useLongPress(() => setSheetOpen(true));
  // Ticking rows (docs/PLAN.md, 2026-11-04 log): only where the page put a selection around its lists.
  const selection = useTaskSelection();
  const selectable = selection !== null && !readOnly;
  const selected = selectable && selection.selected.has(task.id);
  const register = selectable ? selection.register : null;
  useEffect(() => register?.(task.id), [register, task.id]);
  const rejected = task.status === "rejected";
  // "Overdue" is already said by the red due label, so that chip would say it twice.
  const reason = showReason && task.reason !== "Overdue" ? task.reason : undefined;
  const detailsId = `task-${task.id}-details`;
  const where = [task.project?.name, task.goal?.title].filter(Boolean).join(" › ");

  return (
    <li className={cn("group relative", selected && "bg-sidebar-accent/50")} {...handlers} data-task-row={task.id} data-expanded={open || undefined} data-selected={selected || undefined}>
      <div
        className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60 sm:px-4", open && "bg-accent/40")}
        onClick={(event) => {
          if (interactive(event)) return;
          swallowClick(event);
          setOpen((value) => !value);
        }}
      >
        {selectable ? (
          <span data-no-expand className={cn("-ml-1 flex items-center", selected || selection.selected.size > 0 ? "opacity-100" : "opacity-60 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100")}>
            <Checkbox checked={selected} onCheckedChange={() => selection.toggle(task.id)} aria-label={`Select ${task.title}`} data-select-task={task.id} />
          </span>
        ) : null}
        <StatusIcon status={task.status} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
          <Link
            href={`/tasks/${task.id}`}
            prefetch={false}
            data-task-link
            onClick={swallowClick}
            className={cn("truncate text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring md:max-w-[55%] md:shrink-0", rejected && "text-muted-foreground line-through")}
          >
            {task.title}
          </Link>
          {task.nextAction || reason || task.proposal === "pending" ? (
            <span className="flex min-w-0 items-center gap-1.5">
              {reason ? <ReasonChip reason={reason} className="sm:hidden" /> : null}
              {task.proposal === "pending" ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-status-awaiting-bg px-1.5 py-0.5 text-[11px] font-medium text-status-awaiting-fg">
                  <ClipboardCheck className="size-3" aria-hidden />
                  Proposal
                </span>
              ) : null}
              {task.nextAction ? <span className="truncate text-[13px] text-muted-foreground md:text-sm">{task.nextAction}</span> : null}
            </span>
          ) : null}
        </div>
        {reason ? <ReasonChip reason={reason} className="relative hidden sm:inline-flex" /> : null}
        {task.repeats ? <Repeat className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" aria-label={task.repeats} role="img" /> : null}
        <DueLabel due={task.dueDate} today={today} status={task.status} className="relative shrink-0" />
        <PriorityGlyph priority={task.priority} className="relative" />
        <AssigneeStack assignees={task.assignees} className="relative" />
        {readOnly ? null : <TaskMenu task={task} className="hidden opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 md:grid" />}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={open ? "Hide details" : "Show details"}
          onClick={() => setOpen((value) => !value)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        <TaskActionSheet task={task} open={sheetOpen} onOpenChange={setSheetOpen} readOnly={readOnly} />
      </div>
      {open ? (
        <div id={detailsId} className="border-t bg-muted/30 px-4 py-3 sm:px-5 sm:pl-12" data-task-details>
          {task.description ? <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line">{task.description}</p> : <p className="text-sm text-muted-foreground">No description.</p>}
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Assigned to">{describeAssignees(task.assignees)}</Fact>
            <Fact label="Where">{where || "Standalone task"}</Fact>
            <Fact label="Due">
              {task.dueDate ? (
                <>
                  <DueLabel due={task.dueDate} today={today} status={task.status} />
                  {task.dueTime ? ` · ${formatTime(task.dueTime)}` : ""}
                </>
              ) : (
                "No due date"
              )}
              {task.repeats ? <span className="block text-muted-foreground">{task.repeats}</span> : null}
            </Fact>
            <Fact label={task.proposal === "pending" || task.proposal === "declined" ? "Proposal" : "Latest progress"}>
              {task.proposal === "pending" || task.proposal === "declined" ? PROPOSAL_STATUS_LABELS[task.proposal] : task.latestProgress ? <span className="line-clamp-3">{task.latestProgress}</span> : "No progress recorded yet."}
            </Fact>
          </dl>
          <Link href={`/tasks/${task.id}`} prefetch={false} className="mt-3 inline-block text-[13px] font-medium text-link underline-offset-4 hover:underline">
            Open the task
          </Link>
        </div>
      ) : null}
    </li>
  );
}
