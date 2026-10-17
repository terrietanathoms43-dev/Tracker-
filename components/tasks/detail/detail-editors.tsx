"use client";

import { ChevronDown, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { editTask } from "@/actions/tasks";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TaskPriority, TaskStatus } from "@/lib/constants";
import { toastResult } from "@/lib/toast-result";
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
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Escape") cancel();
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
          }}
        />
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
        <p className="min-w-0 text-sm leading-relaxed whitespace-pre-line">{description}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{editable ? "No description. Add one if the title isn't enough." : "No description."}</p>
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

type PickField = "assigneeId" | "projectId" | "goalId" | "priority";

/** A native select that saves on change: assignee, project, goal or priority. */
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
