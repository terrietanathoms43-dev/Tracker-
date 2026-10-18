"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createGoal, updateGoal } from "@/actions/goals";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { nameOf } from "@/lib/tasks/people";
import type { Person } from "@/lib/tasks/types";

// New goal and Edit goal: one dialog, one form. Leaders and admins only; the page decides whether to render it.

type Values = { title: string; description: string; successCriteria: string; ownerId: string; targetDate: string };
type Errors = Record<string, string[] | undefined>;

/** The goal being edited, as the goal page has it. */
export type EditableGoal = {
  id: string;
  title: string;
  description: string | null;
  successCriteria: string | null;
  ownerId: string | null;
  targetDate: string | null;
};

/**
 * Renders its own trigger ("New goal", or "Edit" for an existing goal) and the dialog behind it. Only the title is
 * required; the owner starts as the viewer. Ctrl/⌘+Enter submits; the action's field errors show under each field.
 */
export function GoalDialog({
  goal,
  people,
  viewerId,
  variant = "default",
}: {
  goal?: EditableGoal;
  people: Person[];
  viewerId: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const editing = goal !== undefined;
  const initial = (): Values => ({
    title: goal?.title ?? "",
    description: goal?.description ?? "",
    successCriteria: goal?.successCriteria ?? "",
    ownerId: editing ? (goal.ownerId ?? "") : viewerId,
    targetDate: goal?.targetDate ?? "",
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Values, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const error = (key: keyof Values) => errors[key]?.[0];

  function show() {
    // Start from the goal as it is now: someone may have changed it since the page first rendered.
    setValues(initial());
    setErrors({});
    setOpen(true);
  }

  function submit() {
    if (pending || values.title.trim() === "") return;
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
          New goal
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit goal" : "New goal"}</DialogTitle>
            <DialogDescription>Say what success looks like. Projects and tasks roll up into it.</DialogDescription>
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
            <Field id="goal-title" label="Title" error={error("title")}>
              <Input
                id="goal-title"
                value={values.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="e.g. Cut incident response time in half"
                maxLength={200}
                autoFocus
                aria-invalid={error("title") ? true : undefined}
              />
            </Field>
            <Field id="goal-criteria" label="Success looks like" hint="Optional: how you'll know it's achieved." error={error("successCriteria")}>
              <Textarea
                id="goal-criteria"
                value={values.successCriteria}
                onChange={(event) => set("successCriteria", event.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="e.g. Median time to mitigate under 24 minutes across the next ten incidents"
              />
            </Field>
            <Field id="goal-description" label="Description" hint="Optional: why it matters." error={error("description")}>
              <Textarea id="goal-description" value={values.description} onChange={(event) => set("description", event.target.value)} rows={3} maxLength={4000} />
            </Field>
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
              <Field id="goal-target" label="Target date" hint="Optional." error={error("targetDate")}>
                <Input
                  id="goal-target"
                  type="date"
                  value={values.targetDate}
                  onChange={(event) => set("targetDate", event.target.value)}
                  aria-invalid={error("targetDate") ? true : undefined}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || values.title.trim() === ""}>
                {pending ? (editing ? "Saving…" : "Creating…") : editing ? "Save goal" : "Create goal"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
