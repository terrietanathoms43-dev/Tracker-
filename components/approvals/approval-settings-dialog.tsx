"use client";

import { ArrowDown, ArrowUp, ShieldCheck, X } from "lucide-react";
import { useState, useTransition } from "react";
import { saveGoalApprovals } from "@/actions/goals";
import { saveProjectApprovals } from "@/actions/projects";
import { NativeSelect } from "@/components/native-select";
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

// Who signs off new tasks in a project or under a goal (docs/PLAN.md, 2026-11-03 log): a switch, the chain in
// order (first signs first), and the people whose tasks skip the queue. Leaders and admins only.

export type ApprovalScopeProps = { projectId: string; goalId?: undefined } | { goalId: string; projectId?: undefined };

function PersonRow({ person, children }: { person: Person; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
      <UserAvatar name={person.name} email={person.email} image={person.image} size="sm" className="size-6" />
      <span className="min-w-0 flex-1 truncate">{nameOf(person)}</span>
      {children}
    </li>
  );
}

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
  const [steps, setSteps] = useState<Person[]>(() => settings.steps.map((step) => step.user).filter((user): user is Person => user !== null));
  const [bypass, setBypass] = useState<Person[]>(() => settings.bypass.map((entry) => entry.user));
  const [pending, startTransition] = useTransition();

  function show() {
    setRequires(settings.requiresApproval);
    setSteps(settings.steps.map((step) => step.user).filter((user): user is Person => user !== null));
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
  const notInSteps = people.filter((person) => !steps.some((each) => each.id === person.id));
  const notInBypass = people.filter((person) => !bypass.some((each) => each.id === person.id));

  function save() {
    startTransition(async () => {
      const input = { requiresApproval: requires, stepUserIds: steps.map((person) => person.id), bypassUserIds: bypass.map((person) => person.id) };
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
              When it is on, a task added to {what} is a proposal until everyone in the chain has signed it, in order. Without a chain, any leader or admin signs.
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
              <p className="text-sm font-medium">Who signs, in order</p>
              {steps.length === 0 ? <p className="text-[13px] text-muted-foreground">Nobody named yet: any leader or admin may sign.</p> : null}
              <ol className="grid gap-1" aria-label="Sign-off chain">
                {steps.map((person, index) => (
                  <PersonRow key={person.id} person={person}>
                    <span className="text-[12px] text-muted-foreground tabular-nums">{index + 1}</span>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move ${nameOf(person)} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move ${nameOf(person)} down`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${nameOf(person)} from the chain`} onClick={() => setSteps((current) => current.filter((each) => each.id !== person.id))}>
                      <X aria-hidden />
                    </Button>
                  </PersonRow>
                ))}
              </ol>
              {steps.length < LIMITS.approvalPeople && notInSteps.length > 0 ? (
                <NativeSelect
                  aria-label="Add someone to the chain"
                  value=""
                  onChange={(event) => {
                    const person = people.find((each) => each.id === event.target.value);
                    if (person) setSteps((current) => [...current, person]);
                  }}
                >
                  <option value="">Add a person to the chain…</option>
                  {notInSteps.map((person) => (
                    <option key={person.id} value={person.id}>
                      {nameOf(person)}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
            </div>

            <div className="grid gap-2">
              <p className="text-sm font-medium">Who skips the queue</p>
              <p className="text-[13px] text-muted-foreground">Tasks these people add go live at once.</p>
              {bypass.length > 0 ? (
                <ul className="grid gap-1" aria-label="Bypass list">
                  {bypass.map((person) => (
                    <PersonRow key={person.id} person={person}>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${nameOf(person)} from the bypass list`} onClick={() => setBypass((current) => current.filter((each) => each.id !== person.id))}>
                        <X aria-hidden />
                      </Button>
                    </PersonRow>
                  ))}
                </ul>
              ) : null}
              {bypass.length < LIMITS.approvalPeople && notInBypass.length > 0 ? (
                <NativeSelect
                  aria-label="Add someone who skips the queue"
                  value=""
                  onChange={(event) => {
                    const person = people.find((each) => each.id === event.target.value);
                    if (person) setBypass((current) => [...current, person]);
                  }}
                >
                  <option value="">Add a person who skips the queue…</option>
                  {notInBypass.map((person) => (
                    <option key={person.id} value={person.id}>
                      {nameOf(person)}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
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
