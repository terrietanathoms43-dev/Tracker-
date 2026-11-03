"use client";

import { ChevronDown, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { editTask, setAssignees } from "@/actions/tasks";
import { CharacterCounter } from "@/components/character-counter";
import { GoalPicker } from "@/components/goals/goal-picker";
import { NativeSelect } from "@/components/native-select";
import { ProjectPicker, type ProjectPickerOption } from "@/components/projects/project-picker";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TaskPriority, TaskStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import type { Recurrence } from "@/lib/recurrence";
import { idsOf, sameIds } from "@/lib/tasks/assignees";
import type { Assignees, GoalOption, Person } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";
import { AssigneePicker } from "../assignee-picker";
import { RecurrencePicker } from "../recurrence-picker";
import { StatusMenuItems, useChangeStatus } from "../status-menu";

// The task page's inline editors: each saves one field through editTask (or a status through the shared
// transition rules) and the page refreshes behind it.

export function DescriptionEditor({ taskId, description, editable }: { taskId: string; description: string | null; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description ?? "");
  const [pending, startTransition] = useTransition();
  const cancel = () => {
    setValue(description ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            if (toastResult(await editTask({ taskId, field: "description", value }))) setEditing(false);
          });
        }}
      >
        <Textarea
          aria-label="Description"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={4}
          maxLength={LIMITS.taskDescription}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Escape") cancel();
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="flex justify-end">
          <CharacterCounter value={value} max={LIMITS.taskDescription} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3">
      {description ? (
        <p className="min-w-0 text-base leading-relaxed whitespace-pre-line">{description}</p>
      ) : (
        <p className="text-base text-muted-foreground">{editable ? "No description. Add one if the title isn't enough." : "No description."}</p>
      )}
      {editable ? (
        <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => setEditing(true)} aria-label="Edit description">
          <Pencil aria-hidden />
          Edit
        </Button>
      ) : null}
    </div>
  );
}

/** The status badge as a menu: one click for quick statuses, the small dialog for the ones that need input. */
export function StatusEditor({ taskId, status, allowReject }: { taskId: string; status: TaskStatus; allowReject: boolean }) {
  const { change, pending } = useChangeStatus(taskId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" disabled={pending} aria-label="Change status">
        <span className="inline-flex items-center gap-0.5">
          <StatusBadge status={status} />
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <StatusMenuItems current={status} allowReject={allowReject} onPick={(to) => change(status, to)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The assignees picker on the task page: pick as many as you like, and the change is saved once the list closes
 * (one history line, one round of notifications), not on every tick.
 */
export function AssigneesEditor({ taskId, assignees, people, viewerId }: { taskId: string; assignees: Assignees; people: Person[]; viewerId: string }) {
  const [value, setValue] = useState<string[]>(() => idsOf(assignees));
  const [pending, startTransition] = useTransition();
  // Someone on the task who is no longer a worker here stays pickable, so saving doesn't silently drop them.
  const options = {
    people: [...assignees.filter((person) => !people.some((each) => each.id === person.id)), ...people],
    viewerId,
  };
  function save() {
    const current = idsOf(assignees);
    if (sameIds(current, value)) return;
    startTransition(async () => {
      const result = await setAssignees({ taskId, assigneeIds: value });
      if (!toastResult(result)) setValue(current);
    });
  }
  return <AssigneePicker label="Assigned to" value={value} onChange={setValue} options={options} onClose={save} disabled={pending} className="max-w-md" />;
}

type PickField = "projectId" | "goalId" | "priority";

/** The time of day a task is due, next to its date; blank means no particular time. */
export function TimeEditor({ taskId, time }: { taskId: string; time: string | null }) {
  const [pending, startTransition] = useTransition();
  const save = (value: string) => startTransition(async () => void toastResult(await editTask({ taskId, field: "dueTime", value })));
  return <Input type="time" aria-label="Due time" className="w-32" value={time ?? ""} disabled={pending} onChange={(event) => save(event.target.value)} />;
}

/** How often the task repeats, saved as it changes (a change of rule is one history line). */
export function RecurrenceEditor({ taskId, recurrence, dueDate }: { taskId: string; recurrence: Recurrence | null; dueDate: string | null }) {
  const [value, setValue] = useState<Recurrence | null>(recurrence);
  const [pending, startTransition] = useTransition();
  const save = (next: Recurrence | null) => {
    setValue(next);
    startTransition(async () => {
      if (!toastResult(await editTask({ taskId, field: "recurrence", value: next }))) setValue(recurrence);
    });
  };
  return <RecurrencePicker value={value} onChange={save} anchor={dueDate} idPrefix={`repeat-${taskId}`} disabled={pending} />;
}

/** A native select that saves on change: project, goal or priority. */
export function PickEditor({
  taskId,
  field,
  label,
  value,
  options,
  none,
}: {
  taskId: string;
  field: PickField;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  /** The empty choice ("Unassigned", "No project"); omitted when a value is required. */
  none?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      aria-label={label}
      className="w-full max-w-xs"
      value={value}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        const input: Parameters<typeof editTask>[0] = field === "priority" ? { taskId, field, value: next as TaskPriority } : { taskId, field, value: next };
        startTransition(async () => void toastResult(await editTask(input)));
      }}
    >
      {none !== undefined ? <option value="">{none}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </NativeSelect>
  );
}

/** The task's project, saved as it is picked (a goal from another project comes off, the server says). */
export function ProjectEditor({ taskId, value, options, pinned }: { taskId: string; value: string; options: ProjectPickerOption[]; pinned: string[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <ProjectPicker
      label="Project"
      className="w-full max-w-xs"
      value={value}
      options={options}
      pinned={pinned}
      noneLabel="No project (standalone)"
      disabled={pending}
      triggerProps={{ "data-task-project": "" }}
      onChange={(next) => startTransition(async () => void toastResult(await editTask({ taskId, field: "projectId", value: next })))}
    />
  );
}

/** The task's goal, saved as it is picked; a goal puts the task in that goal's project. */
export function GoalEditor({ taskId, value, goals, projects, projectId }: { taskId: string; value: string; goals: GoalOption[]; projects: { id: string; name: string }[]; projectId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <GoalPicker
      label="Goal"
      className="w-full max-w-xs"
      value={value}
      goals={goals}
      projects={projects}
      projectId={projectId}
      disabled={pending}
      triggerProps={{ "data-task-goal": "" }}
      onChange={(next) => startTransition(async () => void toastResult(await editTask({ taskId, field: "goalId", value: next })))}
    />
  );
}

/** The due date as a native date input, with a way to clear it. */
export function DueEditor({ taskId, due }: { taskId: string; due: string | null }) {
  const [pending, startTransition] = useTransition();
  const save = (value: string) => startTransition(async () => void toastResult(await editTask({ taskId, field: "dueDate", value })));
  return (
    <div className="flex items-center gap-2">
      <Input type="date" aria-label="Due date" className="w-full max-w-44" value={due ?? ""} disabled={pending} onChange={(event) => save(event.target.value)} />
      {due ? (
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={pending} onClick={() => save("")}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}
