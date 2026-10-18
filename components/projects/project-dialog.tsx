"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createProject, updateProject } from "@/actions/projects";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { nameOf } from "@/lib/tasks/people";
import type { Person } from "@/lib/tasks/types";

// New project and Edit project: one dialog, one form. Leaders and admins only; the page decides whether to render it.

type Values = { name: string; description: string; ownerId: string; goalId: string; targetDate: string };
type Errors = Record<string, string[] | undefined>;

/** The project being edited, as the project page has it. */
export type EditableProject = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  goal: { id: string; title: string } | null;
  targetDate: string | null;
};

/**
 * Renders its own trigger ("New project", or "Edit" for an existing project) and the dialog behind it. Only the
 * name is required; the owner starts as the viewer and the goal as `goalId` (a goal page passes its own). `goals`
 * are the active goals; a project already linked to a paused or achieved goal keeps it selectable.
 */
export function ProjectDialog({
  project,
  people,
  goals,
  viewerId,
  goalId = "",
  variant = "default",
}: {
  project?: EditableProject;
  people: Person[];
  goals: { id: string; title: string }[];
  viewerId: string;
  goalId?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const editing = project !== undefined;
  const initial = (): Values => ({
    name: project?.name ?? "",
    description: project?.description ?? "",
    ownerId: editing ? (project.ownerId ?? "") : viewerId,
    goalId: editing ? (project.goal?.id ?? "") : goalId,
    targetDate: project?.targetDate ?? "",
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Values, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const error = (key: keyof Values) => errors[key]?.[0];

  function show() {
    // Start from the project as it is now: someone may have changed it since the page first rendered.
    setValues(initial());
    setErrors({});
    setOpen(true);
  }

  function submit() {
    if (pending || values.name.trim() === "") return;
    startTransition(async () => {
      const result: ActionResult<{ id: string } | undefined> = editing ? await updateProject({ projectId: project.id, ...values }) : await createProject(values);
      if (!result.ok) {
        const fields = result.fieldErrors ?? {};
        if (Object.keys(fields).length > 0) setErrors(fields);
        else toast.error(result.error);
        return;
      }
      setOpen(false);
      const created = result.data;
      if (created) toast.success(result.message ?? "Project created.", { action: { label: "Open", onClick: () => router.push(`/projects/${created.id}`) } });
      else toast.success(result.message ?? "Project saved.");
    });
  }

  const linkedGoal = project?.goal ?? null;
  const goalChoices = linkedGoal && !goals.some((goal) => goal.id === linkedGoal.id) ? [...goals, { ...linkedGoal, title: `${linkedGoal.title} (not active)` }] : goals;
  const ownerMissing = values.ownerId !== "" && !people.some((person) => person.id === values.ownerId);

  return (
    <>
      {editing ? (
        <Button variant="outline" onClick={show}>
          <Pencil aria-hidden />
          Edit
        </Button>
      ) : (
        <Button variant={variant} onClick={show}>
          <Plus aria-hidden />
          New project
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
            <DialogDescription>A project groups related tasks and can roll up into a goal.</DialogDescription>
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
            <Field id="project-name" label="Name" error={error("name")}>
              <Input
                id="project-name"
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="e.g. Incident tooling"
                maxLength={200}
                autoFocus
                aria-invalid={error("name") ? true : undefined}
              />
            </Field>
            <Field id="project-description" label="Description" hint="Optional: what's in it and what isn't." error={error("description")}>
              <Textarea id="project-description" value={values.description} onChange={(event) => set("description", event.target.value)} rows={3} maxLength={4000} />
            </Field>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field id="project-owner" label="Owner" error={error("ownerId")}>
                <NativeSelect
                  id="project-owner"
                  value={values.ownerId}
                  onChange={(event) => set("ownerId", event.target.value)}
                  aria-invalid={error("ownerId") ? true : undefined}
                >
                  <option value="">No owner</option>
                  {ownerMissing ? <option value={values.ownerId}>Current owner</option> : null}
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {nameOf(person)}
                      {person.id === viewerId ? " (me)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="project-target" label="Target date" hint="Optional." error={error("targetDate")}>
                <Input
                  id="project-target"
                  type="date"
                  value={values.targetDate}
                  onChange={(event) => set("targetDate", event.target.value)}
                  aria-invalid={error("targetDate") ? true : undefined}
                />
              </Field>
            </div>
            <Field id="project-goal" label="Goal" hint="Optional: the goal this project moves forward." error={error("goalId")}>
              <NativeSelect
                id="project-goal"
                value={values.goalId}
                onChange={(event) => set("goalId", event.target.value)}
                aria-invalid={error("goalId") ? true : undefined}
              >
                <option value="">No goal</option>
                {goalChoices.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || values.name.trim() === ""}>
                {pending ? (editing ? "Saving…" : "Creating…") : editing ? "Save project" : "Create project"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
