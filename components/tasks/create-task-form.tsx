"use client";

import { ClipboardCheck, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTask } from "@/actions/tasks";
import { Field } from "@/components/field";
import { GoalPicker } from "@/components/goals/goal-picker";
import { ProjectPicker } from "@/components/projects/project-picker";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import type { Recurrence } from "@/lib/recurrence";
import type { CreateDefaults } from "@/lib/tasks/types";
import { AssigneePicker } from "./assignee-picker";
import { RecurrencePicker } from "./recurrence-picker";
import { loadTaskFormOptions, useTaskFormOptions } from "./use-task-form-options";

// The New task form inside the create dialog (N, the New task button, the palette): everything the quick-add bar
// doesn't ask for (a goal, a time of day, a repeat, a first next action, a description).

type Errors = Record<string, string[] | undefined>;

/**
 * Title is all it needs (apex-ux §4); the assignees start as you and the project as the page you came from. The
 * form shows at once: its pickers fill in when the options arrive, and a submit that beats them waits for them.
 * A goal puts the task in that goal's project. A stakeholder's task is a proposal, and the form says so.
 */
export function CreateTaskForm({ defaults = {}, onDone, onCancel }: { defaults?: CreateDefaults; onDone?: (id: string) => void; onCancel?: () => void }) {
  const router = useRouter();
  const { options, error: loadError } = useTaskFormOptions();
  const [title, setTitle] = useState(defaults.title ?? "");
  /** Null until the person touches the picker: "me" once the options say who that is. */
  const [assignment, setAssignment] = useState<string[] | null>(defaults.assigneeIds ?? null);
  const [projectId, setProjectId] = useState(defaults.projectId ?? "");
  const [goalId, setGoalId] = useState(defaults.goalId ?? "");
  const [priority, setPriority] = useState<TaskPriority>(defaults.priority ?? "normal");
  const [dueDate, setDueDate] = useState(defaults.dueDate ?? "");
  const [dueTime, setDueTime] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);
  const [nextAction, setNextAction] = useState("");
  const [description, setDescription] = useState(defaults.description ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();

  const error = (key: string) => errors[key]?.[0];
  /** You, when you are someone work can go to; a stakeholder proposes, and nobody is assigned until it is signed off. */
  const me = (ready: typeof options): string[] => (ready && ready.people.some((person) => person.id === ready.viewerId) ? [ready.viewerId] : []);
  const value = assignment ?? me(options);
  const goals = options?.goals ?? [];
  const proposes = options?.proposesOnly === true;
  // Sign-off applies where the task is going (the goal's rule first, else the project's): it will start local.
  const goalChoice = goalId ? goals.find((goal) => goal.id === goalId) : undefined;
  const projectChoice = projectId ? options?.projects.find((project) => project.id === projectId) : undefined;
  // A sub-task (2026-11-08 log) is made where its parent is, live like its parent: no project or goal to pick.
  const subTask = Boolean(defaults.parentId);
  const local = !proposes && !subTask && (goalChoice ? (goalChoice.signOff ?? false) : (projectChoice?.signOff ?? false));

  function submit() {
    startTransition(async () => {
      // The default assignee is "me", which only the options can name: a quick Enter waits for them.
      const ready = options ?? (await loadTaskFormOptions()).options;
      const assigneeIds = assignment ?? me(ready);
      const result = await createTask({ title, assigneeIds, projectId, goalId, parentId: defaults.parentId ?? "", priority, dueDate, dueTime, recurrence, nextAction, description });
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
      {proposes ? (
        <p className="flex items-start gap-2 rounded-md border border-status-awaiting-dot/30 bg-status-awaiting-bg px-3 py-2 text-[13px] text-status-awaiting-fg">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          This is a proposal: a leader or admin signs it off before it becomes a live task. You can follow it under Proposals.
        </p>
      ) : subTask ? (
        <p className="rounded-md border bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground" data-sub-task-hint>
          A sub-task: it is made under its parent task, in the same project and goal, and listed beneath it.
        </p>
      ) : local ? (
        <p className="flex items-start gap-2 rounded-md border bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground" data-local-hint>
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Sign-off is on here: the task stays local, seen by you alone, until you send it for sign-off from your Local section.
        </p>
      ) : null}
      <Field id="task-title" label="Title" error={error("title")} count={{ value: title, max: LIMITS.taskTitle }}>
        <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs doing?" maxLength={LIMITS.taskTitle} autoFocus aria-invalid={error("title") ? true : undefined} />
      </Field>

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field id="task-assignees" label="Assigned to" error={error("assigneeIds")}>
          <AssigneePicker id="task-assignees" value={value} onChange={setAssignment} options={options ? { people: options.people, viewerId: options.viewerId } : null} assumeMe={assignment === null} />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Field id="task-due" label="Due" error={error("dueDate")}>
            <Input id="task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
          <Field id="task-time" label="Time" hint="Optional.">
            <Input id="task-time" type="time" value={dueTime} className="w-32" onChange={(event) => setDueTime(event.target.value)} />
          </Field>
        </div>
        {!subTask && (loading || options.projects.length > 0 || projectId) ? (
          <Field id="task-project" label="Project" error={error("projectId")}>
            <ProjectPicker
              id="task-project"
              value={projectId}
              options={options?.projects ?? null}
              pinned={options?.pinnedProjects ?? []}
              noneLabel="No project (standalone task)"
              invalid={Boolean(error("projectId"))}
              onChange={(next) => {
                setProjectId(next);
                // A goal from another project can't follow the task.
                if (goalId && !goals.some((goal) => goal.id === goalId && goal.projectId === next)) setGoalId("");
              }}
            />
          </Field>
        ) : null}
        {!subTask && (loading || goals.length > 0 || goalId) ? (
          <Field id="task-goal" label="Goal" hint={projectId ? undefined : "Picking a goal puts the task in that goal's project."} error={error("goalId")}>
            <GoalPicker
              id="task-goal"
              value={goalId}
              goals={options?.goals ?? null}
              projects={options?.projects ?? []}
              projectId={projectId}
              invalid={Boolean(error("goalId"))}
              onChange={(next) => {
                setGoalId(next);
                const goal = goals.find((each) => each.id === next);
                if (goal) setProjectId(goal.projectId);
              }}
            />
          </Field>
        ) : null}
      </div>

      <div className="grid gap-2">
        <span className="text-base leading-none font-medium">Priority</span>
        <Segmented className="w-fit" label="Priority" value={priority} onChange={setPriority} options={[...TASK_PRIORITIES].map((value) => ({ value, label: TASK_PRIORITY_LABELS[value] }))} />
      </div>

      <Field id="repeat-unit" label="Repeat" hint="Completing a repeating task makes the next one, due on the next scheduled day." error={error("recurrence")}>
        <RecurrencePicker value={recurrence} onChange={setRecurrence} anchor={dueDate || null} />
      </Field>

      <Field id="task-next" label="First next action" hint="Optional: the very next step, so whoever picks it up knows where to start." count={{ value: nextAction, max: LIMITS.nextAction }}>
        <Input id="task-next" value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="e.g. Reproduce it on staging" maxLength={LIMITS.nextAction} />
      </Field>
      <Field id="task-description" label="Description" hint="Optional." count={{ value: description, max: LIMITS.taskDescription }}>
        <Textarea id="task-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={LIMITS.taskDescription} />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={pending || title.trim() === ""}>
          {pending ? (proposes ? "Proposing…" : "Creating…") : proposes ? "Propose task" : local ? "Create local task" : "Create task"}
        </Button>
      </div>
    </form>
  );
}
