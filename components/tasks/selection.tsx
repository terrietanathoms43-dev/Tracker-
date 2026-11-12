"use client";

import { CheckSquare, FolderInput, GitMerge, Group, ListChecks, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { bulkAssign, bulkChangeStatus, bulkDelete, bulkMove } from "@/actions/tasks";
import { Field } from "@/components/field";
import { GoalPicker } from "@/components/goals/goal-picker";
import { NativeSelect } from "@/components/native-select";
import { ProjectPicker } from "@/components/projects/project-picker";
import { Segmented } from "@/components/segmented";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { AttachTaskDialog } from "./attach-task-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { CLOSED_WITHOUT_COMPLETION, TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { nameOf } from "@/lib/tasks/people";
import { AssigneePicker } from "./assignee-picker";
import { GroupTogetherDialog } from "./task-group";
import { useTaskFormOptions } from "./use-task-form-options";

// Several tasks at once (docs/PLAN.md, 2026-11-04 log): tick rows, and a bar at the foot of the screen sets a
// status, assigns people, moves them to a project or goal, groups them together, or deletes them. Every task is
// checked by the same rules as on its own page, one transaction each, and the bar says which ones could not change
// and why; those stay ticked so they can be put right and tried again. Two different things sit side by side here
// (2026-11-11 log): **Group together** makes the ticked tasks one group of equals that every list draws inside one
// border; **Make sub-tasks of…** attaches them under one task, parent and child (it was "Group under…").

type Selection = {
  selected: ReadonlySet<string>;
  toggle: (taskId: string) => void;
  clear: () => void;
  selectAll: () => void;
  /** Rows on the page right now, so "Select all" knows how many. */
  register: (taskId: string) => () => void;
  shown: number;
  canDelete: boolean;
};

const SelectionContext = createContext<Selection | null>(null);

/** The selection this row belongs to, or null where rows aren't selectable (a stakeholder, a panel). */
export function useTaskSelection(): Selection | null {
  return use(SelectionContext);
}

type BulkOutcome = { done: number; failed: { id: string; title: string; error: string }[] };

/**
 * Wraps a page's task lists so rows can be ticked. Nothing shows until the first tick; then the bar appears with
 * the count and the actions this person may take. `bar={false}` keeps the ticking and leaves the actions to the
 * wrapper (the Local section's header has its own).
 */
export function SelectionProvider({ enabled = true, canDelete = false, bar = true, children }: { enabled?: boolean; canDelete?: boolean; bar?: boolean; children: ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const mounted = useRef(new Set<string>());
  const [shown, setShown] = useState(0);
  const toggle = useCallback((taskId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const selectAll = useCallback(() => setSelected(new Set(mounted.current)), []);
  const register = useCallback((taskId: string) => {
    mounted.current.add(taskId);
    setShown(mounted.current.size);
    return () => {
      mounted.current.delete(taskId);
      setShown(mounted.current.size);
      // A row that left the page (completed and hidden, deleted) leaves the selection too.
      setSelected((current) => {
        if (!current.has(taskId)) return current;
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    };
  }, []);
  const value = useMemo<Selection>(() => ({ selected, toggle, clear, selectAll, register, shown, canDelete }), [selected, toggle, clear, selectAll, register, shown, canDelete]);
  if (!enabled) return <>{children}</>;
  return (
    <SelectionContext value={value}>
      {children}
      {bar && selected.size > 0 ? <SelectionBar selection={value} /> : null}
    </SelectionContext>
  );
}

const INPUT_STATUSES = new Set<TaskStatus>(["blocked", "awaiting_approval", "completed", "rejected", "deferred", "cancelled"]);

/** The bar: count, Select all, the actions, Clear. Fixed above the phone's tabs, floating at the foot on a desktop. */
function SelectionBar({ selection }: { selection: Selection }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ kind: "status"; status: TaskStatus } | { kind: "assign" } | { kind: "move" } | { kind: "group" } | { kind: "attach" } | { kind: "delete" } | null>(null);
  const ids = [...selection.selected];
  const count = ids.length;

  /** Runs a bulk action, tells the person what happened, refreshes, and keeps only what failed ticked. */
  function run(action: () => Promise<ActionResult<BulkOutcome>>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const failed = new Set(result.data.failed.map((each) => each.id));
      if (failed.size > 0) toast.warning(result.message ?? "Some tasks couldn't change.", { duration: 8000 });
      else toast.success(result.message ?? "Done.");
      setDialog(null);
      router.refresh();
      for (const taskId of ids) if (!failed.has(taskId)) selection.toggle(taskId);
    });
  }

  return (
    <>
      <div
        role="region"
        aria-label={`${count} selected`}
        data-selection-bar
        className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex flex-wrap items-center gap-1.5 rounded-xl border bg-card/95 px-3 py-2 shadow-lg backdrop-blur md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:flex-nowrap"
      >
        <span className="inline-flex items-center gap-1.5 pr-1 text-sm font-semibold whitespace-nowrap tabular-nums">
          <CheckSquare className="size-4 text-primary" aria-hidden />
          {count} selected
        </span>
        {selection.shown > count ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={selection.selectAll} disabled={pending}>
            Select all {selection.shown}
          </Button>
        ) : null}
        <span className="mx-1 hidden h-5 w-px bg-border md:block" aria-hidden />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending} data-bulk-status>
              <ListChecks aria-hidden />
              Set status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {TASK_STATUSES.map((status) => (
              <DropdownMenuItem
                key={status}
                className="gap-2"
                data-bulk-status-choice={status}
                onSelect={() => {
                  if (INPUT_STATUSES.has(status)) setDialog({ kind: "status", status });
                  else run(() => bulkChangeStatus({ taskIds: ids, status }));
                }}
              >
                <StatusIcon status={status} />
                {TASK_STATUS_LABELS[status]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => setDialog({ kind: "assign" })} data-bulk-assign>
          <UserPlus aria-hidden />
          Assign
        </Button>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => setDialog({ kind: "move" })} data-bulk-move>
          <FolderInput aria-hidden />
          Move
        </Button>
        <Button variant="outline" size="sm" disabled={pending || count < 2} title={count < 2 ? "Tick two or more tasks to group them together" : "Show these tasks together, inside one border, in every list"} onClick={() => setDialog({ kind: "group" })} data-bulk-group>
          <Group aria-hidden />
          Group together
        </Button>
        <Button variant="outline" size="sm" disabled={pending} title="Attach these tasks under one task, as its sub-tasks" onClick={() => setDialog({ kind: "attach" })} data-bulk-attach>
          <GitMerge aria-hidden />
          Make sub-tasks of…
        </Button>
        {selection.canDelete ? (
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => setDialog({ kind: "delete" })} data-bulk-delete>
            <Trash2 aria-hidden />
            Delete
          </Button>
        ) : null}
        <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={selection.clear} disabled={pending} className="ml-auto md:ml-1">
          <X aria-hidden />
        </Button>
      </div>
      {dialog?.kind === "status" ? <BulkStatusDialog status={dialog.status} count={count} pending={pending} onClose={() => setDialog(null)} onApply={(fields) => run(() => bulkChangeStatus({ taskIds: ids, status: dialog.status, ...fields }))} /> : null}
      {dialog?.kind === "assign" ? <BulkAssignDialog count={count} pending={pending} onClose={() => setDialog(null)} onApply={(fields) => run(() => bulkAssign({ taskIds: ids, ...fields }))} /> : null}
      {dialog?.kind === "move" ? <BulkMoveDialog count={count} pending={pending} onClose={() => setDialog(null)} onApply={(fields) => run(() => bulkMove({ taskIds: ids, ...fields }))} /> : null}
      {dialog?.kind === "group" ? <GroupTogetherDialog taskIds={ids} pending={pending} onClose={() => setDialog(null)} run={run} /> : null}
      {dialog?.kind === "attach" ? (
        <AttachTaskDialog
          taskIds={ids}
          onClose={() => setDialog(null)}
          onDone={() => {
            selection.clear();
            router.refresh();
          }}
        />
      ) : null}
      {dialog?.kind === "delete" ? <BulkDeleteDialog count={count} pending={pending} onClose={() => setDialog(null)} onApply={() => run(() => bulkDelete({ taskIds: ids }))} /> : null}
    </>
  );
}

const plural = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`;

function Shell({ title, description, children, onClose, onApply, pending, applyLabel, destructive = false, ready = true }: { title: string; description: string; children?: ReactNode; onClose: () => void; onApply: () => void; pending: boolean; applyLabel: string; destructive?: boolean; ready?: boolean }) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children ? (
          <form
            id="bulk-form"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) onApply();
            }}
          >
            {children}
          </form>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={pending || !ready} onClick={onApply} data-bulk-apply>
            {pending ? "Working…" : applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type StatusFields = { reason: string; blockedBy: string; approverId: string; summary: string };

/** The same questions the Update progress form asks for these statuses, once for every ticked task. */
function BulkStatusDialog({ status, count, pending, onClose, onApply }: { status: TaskStatus; count: number; pending: boolean; onClose: () => void; onApply: (fields: StatusFields) => void }) {
  const { options } = useTaskFormOptions();
  const [reason, setReason] = useState("");
  const [blockedBy, setBlockedBy] = useState("");
  const [approverId, setApproverId] = useState("");
  const [summary, setSummary] = useState("");
  const needsReason = status === "blocked" || CLOSED_WITHOUT_COMPLETION.includes(status);
  const ready = needsReason ? reason.trim() !== "" : status === "awaiting_approval" ? approverId !== "" : status === "completed" ? summary.trim() !== "" : true;
  const verb = TASK_STATUS_LABELS[status].toLowerCase();
  return (
    <Shell
      title={`${TASK_STATUS_LABELS[status]}: ${plural(count)}`}
      description={
        status === "completed"
          ? "Each task is completed with the same summary. A task with open comments, or one you may not complete, is left as it is and named."
          : status === "blocked"
            ? "Each task is marked blocked with the same reason."
            : status === "awaiting_approval"
              ? "Each task is sent to the same approver. A task that person is assigned to is left as it is and named."
              : `Each task is ${verb} with the same reason. One you may not ${status === "deferred" ? "defer" : status === "cancelled" ? "cancel" : "reject"} is left as it is and named.`
      }
      onClose={onClose}
      onApply={() => onApply({ reason, blockedBy, approverId, summary })}
      pending={pending}
      ready={ready}
      applyLabel={`${TASK_STATUS_LABELS[status]} ${count === 1 ? "it" : "all"}`}
    >
      {needsReason ? (
        <Field id="bulk-reason" label={status === "blocked" ? "What is blocking them?" : status === "deferred" ? "Why defer them?" : status === "cancelled" ? "Why cancel them?" : "Why reject them?"} count={{ value: reason, max: LIMITS.blockedReason }}>
          <Textarea id="bulk-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={LIMITS.blockedReason} autoFocus />
        </Field>
      ) : null}
      {status === "blocked" ? (
        <Field id="bulk-blocked-by" label="Who or what unblocks them?" hint="Optional." count={{ value: blockedBy, max: LIMITS.blockedBy }}>
          <Input id="bulk-blocked-by" value={blockedBy} onChange={(event) => setBlockedBy(event.target.value)} maxLength={LIMITS.blockedBy} />
        </Field>
      ) : null}
      {status === "awaiting_approval" ? (
        <Field id="bulk-approver" label="Who approves them?">
          <NativeSelect id="bulk-approver" value={approverId} disabled={options === null} onChange={(event) => setApproverId(event.target.value)}>
            <option value="">{options === null ? "Loading…" : "Choose an approver…"}</option>
            {(options?.people ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {nameOf(person)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {status === "completed" ? (
        <Field id="bulk-summary" label="Completion summary" hint="Required: what was done, and why it matters." count={{ value: summary, max: LIMITS.completionSummary }}>
          <Textarea id="bulk-summary" value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} maxLength={LIMITS.completionSummary} autoFocus />
        </Field>
      ) : null}
    </Shell>
  );
}

function BulkAssignDialog({ count, pending, onClose, onApply }: { count: number; pending: boolean; onClose: () => void; onApply: (fields: { assigneeIds: string[]; mode: "replace" | "add" }) => void }) {
  const { options } = useTaskFormOptions();
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"replace" | "add">("replace");
  return (
    <Shell
      title={`Assign ${plural(count)}`}
      description="Pick who the tasks go to. Replace puts exactly these people on each task; Add keeps whoever is on it."
      onClose={onClose}
      onApply={() => onApply({ assigneeIds, mode })}
      pending={pending}
      ready={options !== null && (mode === "add" ? assigneeIds.length > 0 : true)}
      applyLabel={mode === "add" ? "Add them" : assigneeIds.length === 0 ? "Unassign all" : "Assign"}
    >
      <Segmented
        label="How"
        value={mode}
        onChange={setMode}
        className="w-fit"
        options={[
          { value: "replace", label: "Replace" },
          { value: "add", label: "Add" },
        ]}
      />
      <Field id="bulk-assignees" label={mode === "add" ? "Add these people" : "Assigned to"}>
        <AssigneePicker id="bulk-assignees" value={assigneeIds} onChange={setAssigneeIds} options={options ? { people: options.people, viewerId: options.viewerId } : null} placeholder={mode === "add" ? "Pick people…" : "Unassigned"} />
      </Field>
    </Shell>
  );
}

function BulkMoveDialog({ count, pending, onClose, onApply }: { count: number; pending: boolean; onClose: () => void; onApply: (fields: { projectId: string; goalId: string }) => void }) {
  const { options } = useTaskFormOptions();
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");
  return (
    <Shell
      title={`Move ${plural(count)}`}
      description="Put the tasks in a project, and in a goal if you like. No project makes them standalone tasks."
      onClose={onClose}
      onApply={() => onApply({ projectId, goalId })}
      pending={pending}
      ready={options !== null}
      applyLabel={projectId === "" && goalId === "" ? "Make standalone" : "Move"}
    >
      <Field id="bulk-project" label="Project">
        <ProjectPicker
          id="bulk-project"
          value={projectId}
          options={options?.projects ?? null}
          pinned={options?.pinnedProjects ?? []}
          noneLabel="No project (standalone)"
          onChange={(next) => {
            setProjectId(next);
            if (goalId && !options?.goals.some((goal) => goal.id === goalId && goal.projectId === next)) setGoalId("");
          }}
        />
      </Field>
      <Field id="bulk-goal" label="Goal" hint={projectId ? undefined : "Picking a goal puts the tasks in that goal's project."}>
        <GoalPicker
          id="bulk-goal"
          value={goalId}
          goals={options?.goals ?? null}
          projects={options?.projects ?? []}
          projectId={projectId}
          onChange={(next) => {
            setGoalId(next);
            const goal = options?.goals.find((each) => each.id === next);
            if (goal) setProjectId(goal.projectId);
          }}
        />
      </Field>
    </Shell>
  );
}

function BulkDeleteDialog({ count, pending, onClose, onApply }: { count: number; pending: boolean; onClose: () => void; onApply: () => void }) {
  return <Shell title={`Delete ${plural(count)}?`} description="Each task and all of its progress updates, comments and history will be removed permanently." onClose={onClose} onApply={onApply} pending={pending} applyLabel={`Delete ${count === 1 ? "it" : "all"}`} destructive />;
}
