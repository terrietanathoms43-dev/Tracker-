"use client";

import { cn } from "cn";
import { ChevronDown, ClipboardCheck, CornerDownRight, GitMerge, Lock, Repeat, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { PriorityGlyph } from "@/components/priority-glyph";
import { StatusIcon } from "@/components/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PROPOSAL_STATUS_LABELS } from "@/lib/constants";
import { describeAssignees } from "@/lib/tasks/assignees";
import { taskLabel } from "@/lib/tasks/closer";
import { groupLabel } from "@/lib/tasks/groups";
import { describeSubTasks } from "@/lib/tasks/sub-tasks";
import type { TaskListItem } from "@/lib/tasks/types";
import { formatTime } from "@/lib/recurrence";
import { AssigneeStack } from "./assignee-stack";
import { CloserChip } from "./closer-chip";
import { useTaskActions } from "./task-actions";
import { DueLabel } from "./due-label";
import { ReasonChip } from "./reason-chip";
import { useTaskSelection } from "./selection";
import { SendLocalButton } from "./send-local";
import { GroupChip } from "./task-group";
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
 * A screen that has more to say about a row (the Active scope report, 2026-11-07 log) adds a `badge` beside the
 * title, a `note` line under it, something `trailing` after the due date, and `attributes` on the row itself.
 * A sub-task drawn under its parent (2026-11-08 log) is `nested`: indented with a corner mark; one drawn away from
 * its parent carries a "Part of" link instead, and a parent a count of its sub-tasks. A goal's "Everything
 * completed" task (2026-11-09 log) carries a chip naming the goal it marks achieved, right beside its title.
 * A task in a group (2026-11-11 log) is drawn inside the group's border by the list (`inGroup`); where the rest of
 * its group is not on the page it carries a chip naming the group instead.
 */
export function TaskRow({
  task,
  today,
  showReason = true,
  readOnly = false,
  nested = false,
  inGroup = false,
  badge,
  note,
  trailing,
  attributes,
}: {
  task: TaskListItem;
  today: string;
  showReason?: boolean;
  readOnly?: boolean;
  nested?: boolean;
  inGroup?: boolean;
  badge?: ReactNode;
  note?: ReactNode;
  trailing?: ReactNode;
  attributes?: Record<string, string>;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const { handlers, swallowClick } = useLongPress(() => setSheetOpen(true));
  const { openTransition } = useTaskActions();
  const canOpenCompletion = !readOnly && (task.proposal === null || task.proposal === "approved") && (task.status === "not_started" || task.status === "in_progress");
  // Ticking rows (docs/PLAN.md, 2026-11-04 log): only where the page put a selection around its lists.
  const selection = useTaskSelection();
  const selectable = selection !== null && !readOnly;
  const selected = selectable && selection.selected.has(task.id);
  const register = selectable ? selection.register : null;
  useEffect(() => register?.(task.id), [register, task.id]);
  const local = task.proposal === "local";
  // "Overdue" is already said by the red due label, so that chip would say it twice.
  const reason = showReason && task.reason !== "Overdue" ? task.reason : undefined;
  const detailsId = `task-${task.id}-details`;
  const where = [task.project?.name, task.goal?.title].filter(Boolean).join(" › ");
  const closedWithoutCompleting = task.status === "rejected" || task.status === "cancelled" || task.status === "merged";
  // What a screen reader hears for the row's controls: a goal's closer with its goal, never the bare title.
  const label = taskLabel(task);

  return (
    <li
      className={cn("group relative", selected && "bg-sidebar-accent/50", task.proposal === "pending" && "bg-status-awaiting-bg/40", task.proposal === "declined" && "bg-status-blocked-bg/30", local && "bg-muted/40")}
      {...handlers}
      data-task-row={task.id}
      data-expanded={open || undefined}
      data-selected={selected || undefined}
      data-proposal={task.proposal ?? undefined}
      data-nested={nested || undefined}
      data-parent={task.parent?.id}
      data-group={task.group?.id}
      {...attributes}
    >
      <div
        className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60 sm:px-4", open && "bg-accent/40", nested && "bg-muted/20 pl-8 sm:pl-11")}
        onClick={(event) => {
          if (interactive(event)) return;
          swallowClick(event);
          setOpen((value) => !value);
        }}
      >
        {selectable ? (
          <span data-no-expand className={cn("-ml-1 flex items-center", selected || selection.selected.size > 0 ? "opacity-100" : "opacity-60 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100")}>
            <Checkbox checked={selected} onCheckedChange={() => selection.toggle(task.id)} aria-label={`Select ${label}`} data-select-task={task.id} />
          </span>
        ) : null}
        {nested ? <CornerDownRight className="-ml-1 size-3.5 shrink-0 text-muted-foreground" aria-label="Sub-task of the task above" role="img" /> : null}
        {task.proposal === "pending" ? (
          <ClipboardCheck className="size-4 shrink-0 text-status-awaiting-fg" aria-label="Waiting for sign-off" role="img" />
        ) : task.proposal === "declined" ? (
          <XCircle className="size-4 shrink-0 text-status-blocked-fg" aria-label="Declined" role="img" />
        ) : local ? (
          <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Local: only you can see it" role="img" />
        ) : canOpenCompletion ? (
          <button
            type="button"
            aria-label={`Complete ${label}`}
            title="Open task completion"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              openTransition(task.id, "completed");
            }}
            className="relative grid size-4 shrink-0 place-items-center rounded-full outline-none after:absolute after:-inset-2 after:rounded-full after:content-[''] hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StatusIcon status={task.status} />
          </button>
        ) : (
          <StatusIcon status={task.status} />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
          <Link
            href={`/tasks/${task.id}`}
            prefetch={false}
            data-task-link
            onClick={swallowClick}
            className={cn("truncate text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring md:max-w-[55%] md:shrink-0", closedWithoutCompleting && "text-muted-foreground line-through")}
          >
            {task.title}
          </Link>
          {task.goalCloser && task.goal ? <CloserChip goal={task.goal} onClick={swallowClick} className="self-start md:max-w-[45%] md:shrink md:self-auto" /> : null}
          {task.subTasks > 0 ? (
            <Link href={`/tasks/${task.id}#sub-tasks`} prefetch={false} onClick={swallowClick} className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground" data-sub-tasks-chip>
              <GitMerge className="size-3" aria-hidden />
              {describeSubTasks(task.subTasks)}
            </Link>
          ) : null}
          {task.parent !== null && !nested ? (
            <Link href={`/tasks/${task.parent.id}`} prefetch={false} onClick={swallowClick} className="inline-flex h-5 min-w-0 max-w-[40%] shrink items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground" data-part-of-chip title={`Part of ${task.parent.title}`}>
              <CornerDownRight className="size-3 shrink-0" aria-hidden />
              <span className="truncate">Part of {task.parent.title}</span>
            </Link>
          ) : null}
          {task.group !== null && !inGroup ? <GroupChip taskId={task.id} group={task.group} onClick={swallowClick} /> : null}
          {badge}
          {task.nextAction || reason || task.proposal === "pending" || task.proposal === "declined" || local ? (
            <span className="flex min-w-0 items-center gap-1.5">
              {reason ? <ReasonChip reason={reason} className="sm:hidden" /> : null}
              {local ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground" data-proposal-chip>
                  <Lock className="size-3" aria-hidden />
                  Local
                </span>
              ) : task.proposal === "pending" ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-status-awaiting-bg px-1.5 py-0.5 text-[11px] font-medium text-status-awaiting-fg" data-proposal-chip>
                  <ClipboardCheck className="size-3" aria-hidden />
                  Waiting for sign-off
                </span>
              ) : task.proposal === "declined" ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-status-blocked-bg px-1.5 py-0.5 text-[11px] font-medium text-status-blocked-fg" data-proposal-chip>
                  <XCircle className="size-3" aria-hidden />
                  Declined
                </span>
              ) : null}
              {task.nextAction ? <span className="truncate text-[13px] text-muted-foreground md:text-sm">{task.nextAction}</span> : null}
            </span>
          ) : null}
        </div>
        {reason ? <ReasonChip reason={reason} className="relative hidden sm:inline-flex" /> : null}
        {task.repeats ? <Repeat className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" aria-label={task.repeats} role="img" /> : null}
        <DueLabel due={task.dueDate} today={today} status={task.status} className="relative shrink-0" />
        {trailing}
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
      {note ? (
        <div className="-mt-1.5 px-3 pb-2 pl-10 text-[13px] text-muted-foreground sm:px-4 sm:pl-11" data-task-note>
          {note}
        </div>
      ) : null}
      {open ? (
        <div id={detailsId} className="border-t bg-muted/30 px-4 py-3 sm:px-5 sm:pl-12" data-task-details>
          {task.description ? <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line">{task.description}</p> : <p className="text-sm text-muted-foreground">No description.</p>}
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Assigned to">{describeAssignees(task.assignees)}</Fact>
            <Fact label="Where">
              {task.parent !== null ? (
                <span className="block">
                  Part of{" "}
                  <Link href={`/tasks/${task.parent.id}`} prefetch={false} className="text-link underline-offset-4 hover:underline">
                    {task.parent.title}
                  </Link>
                </span>
              ) : null}
              {where || (task.parent === null ? "Standalone task" : null)}
              {task.group !== null ? (
                <span className="block text-muted-foreground">
                  Grouped:{" "}
                  <Link href={`/tasks/${task.id}#group`} prefetch={false} className="text-link underline-offset-4 hover:underline">
                    {groupLabel(task.group)}
                  </Link>{" "}
                  ({task.group.size} tasks)
                </span>
              ) : null}
            </Fact>
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
            <Fact label={local ? "Local task" : task.proposal === "pending" || task.proposal === "declined" ? "Proposal" : "Latest progress"}>
              {local
                ? task.needsSignOff
                  ? "Only you can see it. Sending it for sign-off puts it on the main board as waiting."
                  : "Only you can see it. No sign-off applies here, so publishing makes it live at once."
                : task.proposal === "pending" || task.proposal === "declined"
                  ? PROPOSAL_STATUS_LABELS[task.proposal]
                  : task.latestProgress
                    ? <span className="line-clamp-3">{task.latestProgress}</span>
                    : "No progress recorded yet."}
            </Fact>
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={`/tasks/${task.id}`} prefetch={false} className="inline-block text-[13px] font-medium text-link underline-offset-4 hover:underline">
              Open the task
            </Link>
            {local && !readOnly ? <SendLocalButton taskId={task.id} needsSignOff={task.needsSignOff} variant="outline" /> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
