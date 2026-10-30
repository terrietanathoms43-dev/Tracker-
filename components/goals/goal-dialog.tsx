"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createGoal, updateGoal } from "@/actions/goals";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { subGoalDeadlineProblem } from "@/lib/goals/deadlines";
import { LIMITS } from "@/lib/limits";
import { nameOf } from "@/lib/tasks/people";
import type { Person } from "@/lib/tasks/types";
import { formatDay } from "@/lib/time";

// New goal, New sub-goal and Edit goal: one dialog, one form. Leaders and admins only; the page decides whether to
// render it. A sub-goal sits under one top-level goal and can't be due after it (docs/PLAN.md, 2026-10-30 log).

type Values = { title: string; description: string; successCriteria: string; ownerId: string; parentGoalId: string; projectIds: string[]; targetDate: string };
type Errors = Record<string, string[] | undefined>;

/** The goal being edited, as the goal page has it. */
export type EditableGoal = {
  id: string;
  title: string;
  description: string | null;
  successCriteria: string | null;
  ownerId: string | null;
  parentGoalId: string | null;
  projectIds: string[];
  targetDate: string | null;
  /** A goal with sub-goals can't become a sub-goal, so the dialog hides "Part of" for it. */
  subGoals: number;
};

/** An active project the dialog can attach to the goal, with the goal it already rolls up into (if any). */
export type ProjectOption = { id: string; name: string; goal: { id: string; title: string } | null };

/** A top-level goal a sub-goal can belong to, with the date the sub-goal has to respect. */
export type ParentOption = { id: string; title: string; targetDate: string | null };

/**
 * Renders its own trigger ("New goal", "New sub-goal", or "Edit" for an existing goal) and the dialog behind it.
 * Only the title is required; the owner starts as the viewer. With `parent` set the dialog makes a sub-goal of that
 * goal and says so instead of offering a picker. Ctrl/⌘+Enter submits; the action's field errors show under each field.
 */
export function GoalDialog({
  goal,
  people,
  projects = [],
  parents = [],
  parent,
  viewerId,
  today,
  variant = "default",
  size = "default",
}: {
  goal?: EditableGoal;
  people: Person[];
  projects?: ProjectOption[];
  parents?: ParentOption[];
  /** Preset parent: the dialog creates a sub-goal of this goal (the goal page's "New sub-goal"). */
  parent?: ParentOption;
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
    parentGoalId: goal?.parentGoalId ?? parent?.id ?? "",
    projectIds: goal?.projectIds ?? [],
    targetDate: goal?.targetDate ?? "",
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Values, value: Values[keyof Values]) => setValues((current) => ({ ...current, [key]: value }));
  const error = (key: keyof Values) => errors[key]?.[0];

  // The parent in force: the preset one, or whichever the picker has; its date bounds this goal's date.
  const chosenParent = parent ?? parents.find((option) => option.id === values.parentGoalId) ?? null;
  const isSubGoal = values.parentGoalId !== "";
  const canPickParent = parent === undefined && (goal === undefined || goal.subGoals === 0) && parents.some((option) => option.id !== goal?.id);
  // The same rule the server applies, shown while typing instead of after the save.
  const dateProblem = subGoalDeadlineProblem(chosenParent?.targetDate ?? null, values.targetDate || null, today);

  function show() {
    // Start from the goal as it is now: someone may have changed it since the page first rendered.
    setValues(initial());
    setErrors({});
    setOpen(true);
  }

  function submit() {
    if (pending || values.title.trim() === "" || dateProblem !== null) return;
    startTransition(async () => {
      const result: ActionResult<{ id: string } | undefined> = editing ? await updateGoal({ goalId: goal.id, ...values }) : await createGoal(values);
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
              {parent
                ? `A step towards “${parent.title}”. Its tasks count towards that goal too.`
                : "Say what success looks like. Projects and tasks roll up into it."}
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
            <Field id="goal-criteria" label="Success looks like" hint="Optional: how you'll know it's achieved." error={error("successCriteria")} count={{ value: values.successCriteria, max: LIMITS.successCriteria }}>
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
              <Textarea
                id="goal-description"
                value={values.description}
                onChange={(event) => set("description", event.target.value)}
                rows={3}
                maxLength={LIMITS.goalDescription}
              />
            </Field>
            {canPickParent ? (
              <Field id="goal-parent" label="Part of" hint="Optional: make this a sub-goal of a bigger goal." error={error("parentGoalId")}>
                <NativeSelect id="goal-parent" value={values.parentGoalId} onChange={(event) => set("parentGoalId", event.target.value)} aria-invalid={error("parentGoalId") ? true : undefined}>
                  <option value="">On its own (a top-level goal)</option>
                  {parents
                    .filter((option) => option.id !== goal?.id)
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            ) : null}
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field id="goal-owner" label="Owner" error={error("ownerId")}>
                <NativeSelect
                  id="goal-owner"
                  value={values.ownerId}
                  onChange={(event) => set("ownerId", event.target.value)}
                  aria-invalid={error("ownerId") ? true : undefined}
                >
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
                hint={chosenParent?.targetDate ? `Optional. On or before ${formatDay(chosenParent.targetDate, today)}, the parent goal's target.` : "Optional."}
                error={dateProblem ?? error("targetDate")}
              >
                <Input
                  id="goal-target"
                  type="date"
                  value={values.targetDate}
                  max={chosenParent?.targetDate ?? undefined}
                  onChange={(event) => set("targetDate", event.target.value)}
                  aria-invalid={dateProblem || error("targetDate") ? true : undefined}
                />
              </Field>
            </div>
            {!isSubGoal && (projects.length > 0 || values.projectIds.length > 0) ? (
              <Field id="goal-projects" label="Projects" hint="Optional: the projects that roll up into this goal." error={error("projectIds")}>
                <ul className="grid max-h-40 gap-0.5 overflow-y-auto rounded-md border p-1" aria-labelledby="goal-projects">
                  {projects.map((project) => {
                    const on = values.projectIds.includes(project.id);
                    return (
                      <li key={project.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-sm transition-colors hover:bg-accent">
                          <Checkbox
                            checked={on}
                            onCheckedChange={(next) =>
                              set("projectIds", next === true ? [...values.projectIds, project.id] : values.projectIds.filter((each) => each !== project.id))
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">{project.name}</span>
                          {project.goal && project.goal.id !== goal?.id ? <span className="shrink-0 text-[13px] text-muted-foreground">in {project.goal.title}</span> : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Field>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || values.title.trim() === "" || dateProblem !== null}>
                {pending ? (editing ? "Saving…" : "Creating…") : editing ? "Save goal" : parent ? "Create sub-goal" : "Create goal"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
