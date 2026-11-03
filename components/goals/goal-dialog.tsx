"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createGoal, updateGoal } from "@/actions/goals";
import { Field } from "@/components/field";
import { ProjectPicker } from "@/components/projects/project-picker";
import { NativeSelect } from "@/components/native-select";
import { RecurrencePicker } from "@/components/tasks/recurrence-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import type { ParentOption } from "@/lib/dal/goals";
import { subGoalDeadlineProblem } from "@/lib/goals/deadlines";
import { LIMITS } from "@/lib/limits";
import type { Recurrence } from "@/lib/recurrence";
import { nameOf } from "@/lib/tasks/people";
import type { Person } from "@/lib/tasks/types";
import { formatDay } from "@/lib/time";

// New goal, New sub-goal and Edit goal: one dialog, one form. Leaders and admins only; the page decides whether to
// render it. Every goal belongs to a project (docs/PLAN.md, 2026-11-03 log): the dialog asks for one, offers to
// make a new project on the spot, and a sub-goal takes its parent's. A goal may repeat (weekly standup duties):
// completing it makes the next one, tasks included.

type Values = { title: string; description: string; successCriteria: string; ownerId: string; projectId: string; newProjectName: string; parentGoalId: string; targetDate: string; recurrence: Recurrence | null };
type Errors = Record<string, string[] | undefined>;

/** The goal being edited, as the goal page has it. */
export type EditableGoal = {
  id: string;
  title: string;
  description: string | null;
  successCriteria: string | null;
  ownerId: string | null;
  projectId: string;
  parentGoalId: string | null;
  targetDate: string | null;
  recurrence: Recurrence | null;
  /** A goal with sub-goals can't become a sub-goal, so the dialog hides "Part of" for it. */
  subGoals: number;
};

export type ProjectChoice = { id: string; name: string };

const NEW_PROJECT = "__new__";

/**
 * Renders its own trigger ("New goal", "New sub-goal", or "Edit" for an existing goal) and the dialog behind it.
 * Only the title and the project are required; the owner starts as the viewer. With `parent` set the dialog makes
 * a sub-goal of that goal and says so instead of offering pickers. Ctrl/⌘+Enter submits.
 */
export function GoalDialog({
  goal,
  people,
  projects = [],
  parents = [],
  pinnedProjectIds = [],
  parent,
  defaultProjectId = "",
  viewerId,
  today,
  variant = "default",
  size = "default",
}: {
  goal?: EditableGoal;
  people: Person[];
  projects?: ProjectChoice[];
  parents?: ParentOption[];
  /** The viewer's pinned projects, first in the picker. */
  pinnedProjectIds?: string[];
  /** Preset parent: the dialog creates a sub-goal of this goal (the goal page's "New sub-goal"). */
  parent?: ParentOption;
  /** The project a new goal starts in (the page's, or the navigation's scope). */
  defaultProjectId?: string;
  viewerId: string;
  today: string;
  variant?: "default" | "outline";
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const editing = goal !== undefined;
  const initial = (): Values => ({
    title: goal?.title ?? "",
    description: goal?.description ?? "",
    successCriteria: goal?.successCriteria ?? "",
    ownerId: editing ? (goal.ownerId ?? "") : viewerId,
    projectId: goal?.projectId ?? parent?.projectId ?? defaultProjectId,
    newProjectName: "",
    parentGoalId: goal?.parentGoalId ?? parent?.id ?? "",
    targetDate: goal?.targetDate ?? "",
    recurrence: goal?.recurrence ?? null,
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));
  const error = (key: keyof Values) => errors[key]?.[0];

  // The parent in force: the preset one, or whichever the picker has; its date bounds this goal's date and its
  // project is this goal's project.
  const chosenParent = parent ?? parents.find((option) => option.id === values.parentGoalId) ?? null;
  const isSubGoal = values.parentGoalId !== "";
  const canPickParent = parent === undefined && (goal === undefined || goal.subGoals === 0) && parents.some((option) => option.id !== goal?.id);
  const projectId = chosenParent ? chosenParent.projectId : values.projectId;
  const makingProject = projectId === NEW_PROJECT;
  // The same rule the server applies, shown while typing instead of after the save.
  const dateProblem = subGoalDeadlineProblem(chosenParent?.targetDate ?? null, values.targetDate || null, today);
  const needsProject = !chosenParent && projectId === "";
  const repeatNeedsDate = values.recurrence !== null && values.targetDate === "";
  const parentChoices = parents.filter((option) => option.id !== goal?.id && (values.projectId === "" || values.projectId === NEW_PROJECT || option.projectId === values.projectId));

  function show() {
    // Start from the goal as it is now: someone may have changed it since the page first rendered.
    setValues(initial());
    setErrors({});
    setOpen(true);
  }

  function submit() {
    if (pending || values.title.trim() === "" || dateProblem !== null || needsProject || repeatNeedsDate || (makingProject && values.newProjectName.trim() === "")) return;
    startTransition(async () => {
      const payload = { ...values, projectId: makingProject ? "" : chosenParent ? chosenParent.projectId : values.projectId, newProjectName: makingProject ? values.newProjectName : "" };
      const result: ActionResult<{ id: string; projectId: string } | undefined> = editing ? await updateGoal({ goalId: goal.id, ...payload }) : await createGoal(payload);
      if (!result.ok) {
        const fields = result.fieldErrors ?? {};
        if (Object.keys(fields).length > 0) setErrors(fields);
        else toast.error(result.error);
        return;
      }
      setOpen(false);
      const created = result.data;
      if (created) toast.success(result.message ?? "Goal created.", { action: { label: "Open", onClick: () => router.push(`/goals/${created.id}`) } });
      else toast.success(result.message ?? "Goal saved.");
    });
  }

  // The owner may have left the workspace's workers; keep them selectable so saving doesn't silently change it.
  const ownerMissing = values.ownerId !== "" && !people.some((person) => person.id === values.ownerId);
  const title = editing ? "Edit goal" : parent ? "New sub-goal" : "New goal";

  return (
    <>
      {editing ? (
        <Button variant="outline" size={size} onClick={show}>
          <Pencil aria-hidden />
          Edit
        </Button>
      ) : (
        <Button variant={variant} size={size} onClick={show}>
          <Plus aria-hidden />
          {parent ? "New sub-goal" : "New goal"}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {parent ? `A step towards “${parent.title}”, in the same project. Its tasks count towards that goal too.` : "Say what success looks like. A goal lives in a project; its tasks roll up into it."}
            </DialogDescription>
          </DialogHeader>
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
            <Field id="goal-title" label="Title" error={error("title")} count={{ value: values.title, max: LIMITS.goalTitle }}>
              <Input
                id="goal-title"
                value={values.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder={parent ? "e.g. Invitations work without a support call" : "e.g. Cut incident response time in half"}
                maxLength={LIMITS.goalTitle}
                autoFocus
                aria-invalid={error("title") ? true : undefined}
              />
            </Field>
            {!chosenParent ? (
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Field id="goal-project" label="Project" error={error("projectId")}>
                  <ProjectPicker
                    id="goal-project"
                    value={projectId}
                    options={makingProject ? [{ id: NEW_PROJECT, name: "New project (named below)" }, ...projects] : projects}
                    pinned={pinnedProjectIds}
                    placeholder={projects.length === 0 ? "No projects yet: name one →" : "Pick a project…"}
                    extra={{ value: NEW_PROJECT, label: "+ New project…" }}
                    invalid={Boolean(error("projectId"))}
                    onChange={(next) => set("projectId", next)}
                  />
                </Field>
                {makingProject ? (
                  <Field id="goal-new-project" label="New project's name" error={error("newProjectName")} count={{ value: values.newProjectName, max: LIMITS.projectName }}>
                    <Input id="goal-new-project" value={values.newProjectName} onChange={(event) => set("newProjectName", event.target.value)} placeholder="e.g. Lumen Health" maxLength={LIMITS.projectName} autoFocus />
                  </Field>
                ) : null}
              </div>
            ) : null}
            <Field id="goal-criteria" label="Success looks like" hint="Optional: how you'll know it's done." error={error("successCriteria")} count={{ value: values.successCriteria, max: LIMITS.successCriteria }}>
              <Textarea
                id="goal-criteria"
                value={values.successCriteria}
                onChange={(event) => set("successCriteria", event.target.value)}
                rows={2}
                maxLength={LIMITS.successCriteria}
                placeholder="e.g. Median time to mitigate under 24 minutes across the next ten incidents"
              />
            </Field>
            <Field id="goal-description" label="Description" hint="Optional: why it matters." error={error("description")} count={{ value: values.description, max: LIMITS.goalDescription }}>
              <Textarea id="goal-description" value={values.description} onChange={(event) => set("description", event.target.value)} rows={3} maxLength={LIMITS.goalDescription} />
            </Field>
            {canPickParent && parentChoices.length > 0 ? (
              <Field id="goal-parent" label="Part of" hint="Optional: make this a sub-goal of a bigger goal in the same project." error={error("parentGoalId")}>
                <NativeSelect id="goal-parent" value={values.parentGoalId} onChange={(event) => set("parentGoalId", event.target.value)} aria-invalid={error("parentGoalId") ? true : undefined}>
                  <option value="">On its own (a top-level goal)</option>
                  {parentChoices.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field id="goal-owner" label="Owner" error={error("ownerId")}>
                <NativeSelect id="goal-owner" value={values.ownerId} onChange={(event) => set("ownerId", event.target.value)} aria-invalid={error("ownerId") ? true : undefined}>
                  {values.ownerId === "" ? <option value="">No owner</option> : null}
                  {ownerMissing ? <option value={values.ownerId}>Current owner</option> : null}
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {nameOf(person)}
                      {person.id === viewerId ? " (me)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                id="goal-target"
                label="Target date"
                hint={chosenParent?.targetDate ? `Optional. On or before ${formatDay(chosenParent.targetDate, today)}, the parent goal's target.` : "Optional, unless it repeats."}
                error={dateProblem ?? error("targetDate") ?? (repeatNeedsDate ? "A repeating goal needs a first target date." : undefined)}
              >
                <Input
                  id="goal-target"
                  type="date"
                  value={values.targetDate}
                  max={chosenParent?.targetDate ?? undefined}
                  onChange={(event) => set("targetDate", event.target.value)}
                  aria-invalid={dateProblem || error("targetDate") || repeatNeedsDate ? true : undefined}
                />
              </Field>
            </div>
            {!isSubGoal ? (
              <Field id="goal-repeat-unit" label="Repeat" hint="Completing a repeating goal makes the next one, with fresh copies of its tasks." error={error("recurrence")}>
                <RecurrencePicker value={values.recurrence} onChange={(next) => set("recurrence", next)} anchor={values.targetDate || null} withTime={false} idPrefix="goal-repeat" />
              </Field>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || values.title.trim() === "" || dateProblem !== null || needsProject || repeatNeedsDate || (makingProject && values.newProjectName.trim() === "")}>
                {pending ? (editing ? "Saving…" : "Creating…") : editing ? "Save goal" : parent ? "Create sub-goal" : "Create goal"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
