"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTask } from "@/actions/tasks";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import type { CreateDefaults } from "@/lib/tasks/types";
import { AssigneePicker } from "./assignee-picker";
import { loadTaskFormOptions, useTaskFormOptions } from "./use-task-form-options";

// The New task form inside the create dialog (N, the New task button, the palette).

type Errors = Record<string, string[] | undefined>;

/**
 * Title is all it needs (apex-ux §4); the assignees start as you and the project as the page you came from. The
 * form shows at once: its pickers fill in when the options arrive, and a submit that beats them waits for them.
 */
export function CreateTaskForm({
   defaults = {},
   onDone,
   onCancel,
}: {
   defaults?: CreateDefaults;
   onDone?: (id: string) => void;
   onCancel?: () => void;
}) {
   const router = useRouter();
   const { options, error: loadError } = useTaskFormOptions();
   const [title, setTitle] = useState(defaults.title ?? "");
   /** Null until the person touches the picker: "me" once the options say who that is. */
   const [assignment, setAssignment] = useState<string[] | null>(defaults.assigneeIds ?? null);
   const [projectId, setProjectId] = useState(defaults.projectId ?? "");
   const [goalId, setGoalId] = useState(defaults.goalId ?? "");
   const [priority, setPriority] = useState<TaskPriority>(defaults.priority ?? "normal");
   const [dueDate, setDueDate] = useState(defaults.dueDate ?? "");
   const [nextAction, setNextAction] = useState("");
   const [description, setDescription] = useState("");
   const [errors, setErrors] = useState<Errors>({});
   const [pending, startTransition] = useTransition();

   const error = (key: string) => errors[key]?.[0];
   const me = (viewerId: string | null): string[] => (viewerId ? [viewerId] : []);
   const value = assignment ?? me(options?.viewerId ?? null);

   function submit() {
      startTransition(async () => {
         // The default assignee is "me", which only the options can name: a quick Enter waits for them.
         const ready = options ?? (await loadTaskFormOptions()).options;
         const assigneeIds = assignment ?? me(ready?.viewerId ?? null);
         const result = await createTask({ title, assigneeIds, projectId, goalId, priority, dueDate, nextAction, description });
         if (!result.ok) {
            setErrors(result.fieldErrors ?? { title: [result.error] });
            return;
         }
         const id = result.data.id;
         toast.success(result.message ?? "Task created.", { action: { label: "Open", onClick: () => router.push(`/tasks/${id}`) } });
         onDone?.(id);
      });
   }

   if (loadError) return <p className="text-base text-muted-foreground">{loadError}</p>;
   const loading = options === null;

   return (
      <form
         className="grid gap-4"
         onSubmit={(event) => {
            event.preventDefault();
            submit();
         }}
         onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
               event.preventDefault();
               submit();
            }
         }}
      >
         <Field id="task-title" label="Title" error={error("title")} count={{ value: title, max: LIMITS.taskTitle }}>
            <Input
               id="task-title"
               value={title}
               onChange={(event) => setTitle(event.target.value)}
               placeholder="What needs doing?"
               maxLength={LIMITS.taskTitle}
               autoFocus
               aria-invalid={error("title") ? true : undefined}
            />
         </Field>

         <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field id="task-assignees" label="Assigned to" error={error("assigneeIds")}>
               <AssigneePicker
                  id="task-assignees"
                  value={value}
                  onChange={setAssignment}
                  options={options ? { people: options.people, viewerId: options.viewerId } : null}
                  assumeMe={assignment === null}
               />
            </Field>
            <Field id="task-due" label="Due" error={error("dueDate")}>
               <Input id="task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </Field>
            {loading || options.projects.length > 0 || projectId ? (
               <Field id="task-project" label="Project" error={error("projectId")}>
                  <NativeSelect
                     id="task-project"
                     value={projectId}
                     disabled={loading}
                     onChange={(event) => setProjectId(event.target.value)}
                  >
                     <option value="">{loading ? "Loading…" : "No project"}</option>
                     {(options?.projects ?? []).map((project) => (
                        <option key={project.id} value={project.id}>
                           {project.name}
                        </option>
                     ))}
                  </NativeSelect>
               </Field>
            ) : null}
            {loading || options.goals.length > 0 || goalId ? (
               <Field id="task-goal" label="Goal" error={error("goalId")}>
                  <NativeSelect id="task-goal" value={goalId} disabled={loading} onChange={(event) => setGoalId(event.target.value)}>
                     <option value="">{loading ? "Loading…" : "No goal"}</option>
                     {(options?.goals ?? []).map((goal) => (
                        <option key={goal.id} value={goal.id}>
                           {goal.title}
                        </option>
                     ))}
                  </NativeSelect>
               </Field>
            ) : null}
         </div>

         <div className="grid gap-2">
            <span className="text-base leading-none font-medium">Priority</span>
            <Segmented
               className="w-fit"
               label="Priority"
               value={priority}
               onChange={setPriority}
               options={[...TASK_PRIORITIES].map((value) => ({ value, label: TASK_PRIORITY_LABELS[value] }))}
            />
         </div>

         <Field
            id="task-next"
            label="First next action"
            hint="Optional: the very next step, so whoever picks it up knows where to start."
            count={{ value: nextAction, max: LIMITS.nextAction }}
         >
            <Input
               id="task-next"
               value={nextAction}
               onChange={(event) => setNextAction(event.target.value)}
               placeholder="e.g. Reproduce it on staging"
               maxLength={LIMITS.nextAction}
            />
         </Field>
         <Field id="task-description" label="Description" hint="Optional." count={{ value: description, max: LIMITS.taskDescription }}>
            <Textarea
               id="task-description"
               value={description}
               onChange={(event) => setDescription(event.target.value)}
               rows={3}
               maxLength={LIMITS.taskDescription}
            />
         </Field>

         <div className="flex items-center justify-end gap-2 pt-1">
            {onCancel ? (
               <Button type="button" variant="ghost" onClick={onCancel}>
                  Cancel
               </Button>
            ) : null}
            <Button type="submit" disabled={pending || title.trim() === ""}>
               {pending ? "Creating…" : "Create task"}
            </Button>
         </div>
      </form>
   );
}
