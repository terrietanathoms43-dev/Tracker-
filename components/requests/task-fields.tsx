"use client";

import { Field } from "@/components/field";
import { Segmented } from "@/components/segmented";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { Input } from "@/components/ui/input";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import type { AssigneeIds } from "@/lib/tasks/assignees";
import type { TaskFormOptions } from "@/lib/tasks/types";

// The fields of the task a request becomes, inside the Approve ("Create the task now") and Convert dialogs.

type Errors = Record<string, string[] | undefined>;

/** Assignees (people and teams), priority and due date for the task a request becomes. The pickers load when the fields first show. */
export function TaskFields({
   options,
   assignment,
   onAssignment,
   priority,
   onPriority,
   dueDate,
   onDueDate,
   errors,
}: {
   options: TaskFormOptions | null;
   assignment: AssigneeIds;
   onAssignment: (value: AssigneeIds) => void;
   priority: TaskPriority;
   onPriority: (value: TaskPriority) => void;
   dueDate: string;
   onDueDate: (value: string) => void;
   errors: Errors;
}) {
   return (
      <div className="grid gap-4 rounded-lg border bg-muted/40 p-3">
         <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field id="decision-assignees" label="Assigned to" error={errors.assigneeIds?.[0] ?? errors.teamIds?.[0]}>
               <AssigneePicker
                  id="decision-assignees"
                  value={assignment}
                  onChange={onAssignment}
                  options={options ? { people: options.people, teams: options.teams, viewerId: options.viewerId } : null}
                  className="bg-background"
               />
            </Field>
            <Field id="decision-due" label="Due" error={errors.dueDate?.[0]}>
               <Input id="decision-due" type="date" value={dueDate} onChange={(event) => onDueDate(event.target.value)} />
            </Field>
         </div>
         <div className="grid gap-2">
            <span className="text-base leading-none font-medium">Priority</span>
            <Segmented
               className="w-fit"
               label="Priority"
               value={priority}
               onChange={onPriority}
               options={TASK_PRIORITIES.map((value) => ({ value, label: TASK_PRIORITY_LABELS[value] }))}
            />
         </div>
      </div>
   );
}
