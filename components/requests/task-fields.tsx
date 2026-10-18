"use client";

import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { Segmented } from "@/components/segmented";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import { nameOf } from "@/lib/tasks/people";
import type { TaskFormOptions } from "@/lib/tasks/types";

// The fields of the task a request becomes, inside the Approve ("Create the task now") and Convert dialogs.

type Errors = Record<string, string[] | undefined>;

/** Assignee, priority and due date for the task a request becomes. The workers load when the fields first show. */
export function TaskFields({
  options,
  assigneeId,
  onAssignee,
  priority,
  onPriority,
  dueDate,
  onDueDate,
  errors,
}: {
  options: TaskFormOptions | null;
  assigneeId: string;
  onAssignee: (value: string) => void;
  priority: TaskPriority;
  onPriority: (value: TaskPriority) => void;
  dueDate: string;
  onDueDate: (value: string) => void;
  errors: Errors;
}) {
  return (
    <div className="grid gap-4 rounded-lg border bg-muted/40 p-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="decision-assignee" label="Assignee" error={errors.assigneeId?.[0]}>
          {options === null ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <NativeSelect id="decision-assignee" value={assigneeId} onChange={(event) => onAssignee(event.target.value)}>
              <option value="">Unassigned</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {nameOf(person)}
                  {person.id === options.viewerId ? " (me)" : ""}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field id="decision-due" label="Due" error={errors.dueDate?.[0]}>
          <Input id="decision-due" type="date" value={dueDate} onChange={(event) => onDueDate(event.target.value)} />
        </Field>
      </div>
      <div className="grid gap-2">
        <span className="text-sm leading-none font-medium">Priority</span>
        <Segmented className="w-fit" label="Priority" value={priority} onChange={onPriority} options={TASK_PRIORITIES.map((value) => ({ value, label: TASK_PRIORITY_LABELS[value] }))} />
      </div>
    </div>
  );
}
