"use client";

import { ArrowDown, ArrowUp, Plus, ShieldCheck, X } from "lucide-react";
import { useState, useTransition } from "react";
import { saveGoalApprovals } from "@/actions/goals";
import { saveProjectApprovals } from "@/actions/projects";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { UserAvatar } from "@/components/user-avatar";
import type { ApprovalSettings } from "@/lib/dal/approvals";
import { LIMITS } from "@/lib/limits";
import { nameOf } from "@/lib/tasks/people";
import type { Person } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";

// Who signs off new tasks in a project or under a goal (docs/PLAN.md, 2026-11-03 and 2026-11-04 logs): a switch,
// the steps in order, and the people whose tasks skip the queue. A step names one person or several ("Max or
// Terri": any one of them signs); a step naming nobody is any leader or admin's. People are picked from a
// searchable list, the same one tasks are assigned with. Leaders and admins only.

export type ApprovalScopeProps = { projectId: string; goalId?: undefined } | { goalId: string; projectId?: undefined };

const MAX_STEPS = 10;

export function ApprovalSettingsDialog({
  scope,
  settings,
  people,
  what,
  variant = "outline",
}: {
  scope: ApprovalScopeProps;
  settings: ApprovalSettings;
  people: Person[];
  /** "this project" / "this goal": the words in the dialog. */
  what: string;
  variant?: "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [requires, setRequires] = useState(settings.requiresApproval);
  const [steps, setSteps] = useState<Person[][]>(() => settings.steps.map((step) => step.users));
  const [bypass, setBypass] = useState<Person[]>(() => settings.bypass.map((entry) => entry.user));
  const [pending, startTransition] = useTransition();
  const options = { people, viewerId: null };
  const byId = (ids: string[]) => ids.map((id) => people.find((person) => person.id === id)).filter((person): person is Person => person !== undefined);

  function show() {
    setRequires(settings.requiresApproval);
    setSteps(settings.steps.map((step) => step.users));
    setBypass(settings.bypass.map((entry) => entry.user));
    setOpen(true);
  }

  const move = (index: number, delta: number) =>
    setSteps((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  function save() {
    startTransition(async () => {
      const input = { requiresApproval: requires, steps: steps.map((group) => group.map((person) => person.id)), bypassUserIds: bypass.map((person) => person.id) };
      const result = scope.goalId !== undefined ? await saveGoalApprovals({ goalId: scope.goalId, ...input }) : await saveProjectApprovals({ projectId: scope.projectId, ...input });
      if (toastResult(result)) setOpen(false);
    });
  }

  return (
    <>
      <Button variant={variant} onClick={show} data-approval-settings>
        <ShieldCheck aria-hidden />
        Sign-off{settings.requiresApproval ? " on" : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign-off for new tasks</DialogTitle>
            <DialogDescription>
              When it is on, a task someone adds to {what} starts local: theirs alone, off the main board, until they send it for sign-off. Then it shows at once but waits for each step below to be signed, in order. A step with several people is signed by any one of them; a step with nobody is any leader or admin&apos;s. Switch it off and their local tasks publish instead.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="flex items-center gap-3">
              <Switch id="approvals-on" checked={requires} onCheckedChange={setRequires} />
              <Label htmlFor="approvals-on" className="text-base">
                New tasks need sign-off
              </Label>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Who signs, step by step</p>
                {steps.length < MAX_STEPS ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSteps((current) => [...current, []])} data-add-step>
                    <Plus aria-hidden />
                    Add a step
                  </Button>
                ) : null}
              </div>
              {steps.length === 0 ? <p className="text-[13px] text-muted-foreground">No steps yet: any leader or admin may sign.</p> : null}
              <ol className="grid gap-2" aria-label="Sign-off steps">
                {steps.map((group, index) => (
                  <li key={index} className="grid gap-2 rounded-md border bg-background p-2.5" data-approval-step={index + 1}>
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-semibold tabular-nums">{index + 1}</span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
                        {group.length === 0 ? (
                          <span className="text-muted-foreground">Any leader or admin</span>
                        ) : (
                          group.map((person, personIndex) => (
                            <span key={person.id} className="inline-flex items-center gap-1.5">
                              {personIndex > 0 ? <span className="text-[12px] text-muted-foreground">or</span> : null}
                              <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5">
                                <UserAvatar name={person.name} email={person.email} image={person.image} size="sm" className="size-4" />
                                {nameOf(person)}
                              </span>
                            </span>
                          ))
                        )}
                      </div>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move step ${index + 1} down`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps((current) => current.filter((_, each) => each !== index))}>
                        <X aria-hidden />
                      </Button>
                    </div>
                    <AssigneePicker
                      label={`People who may sign step ${index + 1}`}
                      value={group.map((person) => person.id)}
                      onChange={(ids) => setSteps((current) => current.map((each, eachIndex) => (eachIndex === index ? byId(ids).slice(0, LIMITS.approvalPeople) : each)))}
                      options={options}
                      placeholder="Pick who may sign this step…"
                      className="h-8 text-[13px]"
                    />
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid gap-2">
              <p className="text-sm font-medium">Who skips the queue</p>
              <p className="text-[13px] text-muted-foreground">Tasks these people add go live at once.</p>
              <AssigneePicker label="People who skip the queue" value={bypass.map((person) => person.id)} onChange={(ids) => setBypass(byId(ids).slice(0, LIMITS.approvalPeople))} options={options} placeholder="Nobody skips the queue" />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save sign-off settings"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
