"use client";

import { ArrowRight, GitFork } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { setGoalConnections } from "@/actions/goals";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GoalRef } from "@/lib/dal/goals";
import { toastResult } from "@/lib/toast-result";

// A goal's place in the chain (docs/PLAN.md, 2026-11-03 log): what leads into it and what it leads to, drawn on
// the Goals page's branch view. Managers edit both lists in one dialog; everyone reads them.

/** A goal another goal can be connected to: in the same workspace, with its project for the label. */
export type ConnectionChoice = { id: string; title: string; projectName: string };

function RefList({ items, empty }: { items: GoalRef[]; empty: string }) {
  if (items.length === 0) return <p className="text-[13px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((goal) => (
        <li key={goal.id}>
          <Link href={`/goals/${goal.id}`} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[13px] font-medium hover:bg-accent">
            {goal.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ChoiceList({ label, choices, value, onChange, exclude }: { label: string; choices: ConnectionChoice[]; value: string[]; onChange: (next: string[]) => void; exclude: string[] }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <ul className="grid max-h-44 gap-0.5 overflow-y-auto rounded-md border p-1" aria-label={label}>
        {choices.map((goal) => {
          const on = value.includes(goal.id);
          const taken = !on && exclude.includes(goal.id);
          return (
            <li key={goal.id}>
              <label className={`flex cursor-pointer items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-sm transition-colors hover:bg-accent ${taken ? "opacity-50" : ""}`}>
                <Checkbox checked={on} disabled={taken} onCheckedChange={(next) => onChange(next === true ? [...value, goal.id] : value.filter((each) => each !== goal.id))} />
                <span className="min-w-0 flex-1 truncate">{goal.title}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground">{goal.projectName}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The Connections card on a goal page: comes after · leads to, with an Edit for managers. */
export function GoalConnections({ goalId, comesAfter, leadsTo, choices, canEdit }: { goalId: string; comesAfter: GoalRef[]; leadsTo: GoalRef[]; choices: ConnectionChoice[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState<string[]>(() => comesAfter.map((goal) => goal.id));
  const [after, setAfter] = useState<string[]>(() => leadsTo.map((goal) => goal.id));
  const [pending, startTransition] = useTransition();
  const show = () => {
    setBefore(comesAfter.map((goal) => goal.id));
    setAfter(leadsTo.map((goal) => goal.id));
    setOpen(true);
  };
  const save = () =>
    startTransition(async () => {
      if (toastResult(await setGoalConnections({ goalId, comesAfter: before, leadsTo: after }))) setOpen(false);
    });
  const options = choices.filter((goal) => goal.id !== goalId);

  return (
    <section aria-labelledby="connections-heading" className="min-w-0 rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="connections-heading" className="flex items-center gap-2 text-base font-semibold">
          <GitFork className="size-4 text-muted-foreground" aria-hidden />
          Connections
        </h2>
        {canEdit && options.length > 0 ? (
          <Button variant="outline" size="sm" onClick={show}>
            Edit connections
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        <div className="grid gap-1.5">
          <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Comes after</p>
          <RefList items={comesAfter} empty="Nothing leads into this goal." />
        </div>
        <ArrowRight className="hidden size-4 self-center text-muted-foreground sm:block" aria-hidden />
        <div className="grid gap-1.5">
          <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Leads to</p>
          <RefList items={leadsTo} empty="This goal leads nowhere yet." />
        </div>
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">
        See the whole chain in the{" "}
        <Link href="/goals?view=branches" className="text-link underline-offset-4 hover:underline">
          branch view
        </Link>
        .
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect this goal</DialogTitle>
            <DialogDescription>Pick what this goal follows and what it leads to. A goal can&apos;t lead back into something that leads to it.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <ChoiceList label="Comes after" choices={options} value={before} onChange={setBefore} exclude={after} />
            <ChoiceList label="Leads to" choices={options} value={after} onChange={setAfter} exclude={before} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save connections"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
