"use client";

import { CalendarClock, Check, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { decideDueChange, requestDueChange, withdrawDueChange } from "@/actions/due-changes";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PendingDueChange } from "@/lib/dal/due-changes";
import { LIMITS } from "@/lib/limits";
import { classifyDueChange, DUE_CHANGE_HINTS, DUE_CHANGE_LABELS } from "@/lib/tasks/due-change";
import { nameOf } from "@/lib/tasks/people";
import { toastResult } from "@/lib/toast-result";
import { formatDay } from "@/lib/time";

// A task's due date after it has been made (docs/PLAN.md, 2026-11-24 log): it changes through one small dialog that
// asks for the new date and the reason, says what the change is called (Scheduled, Deferred, Brought forward, Due
// date removed) and whether it takes effect now or waits for an admin. A change that waits is shown where the date
// is, with Approve and Decline for an admin and Withdraw for whoever asked.

const dayOrNone = (day: string | null, today: string) => (day ? formatDay(day, today) : "No date");

/**
 * The Due row's control for someone who may edit the task: the date as text and a button that opens the dialog.
 * `immediate` says the viewer's change takes effect at once (an admin, or a task that is not live yet); otherwise it
 * waits for an admin. While a change is waiting the button is off: one request per task at a time.
 */
export function DueChangeEditor({ taskId, due, today, immediate, waiting, repeats }: { taskId: string; due: string | null; today: string; immediate: boolean; waiting: boolean; repeats: boolean }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(due ?? "");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const to = date === "" ? null : date;
  const kind = classifyDueChange(due, to, today);
  const blockedByRepeat = to === null && repeats && due !== null;
  const ready = kind !== null && reason.trim() !== "" && !blockedByRepeat;
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setDate(due ?? "");
      setReason("");
    }
  };
  const submit = () =>
    startTransition(async () => {
      if (toastResult(await requestDueChange({ taskId, dueDate: date, reason }))) close(false);
    });
  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className={due ? undefined : "text-muted-foreground"} data-task-due={due ?? ""}>
          {due ? formatDay(due, today) : "No due date"}
        </span>
        <Button type="button" variant="outline" size="sm" disabled={waiting} onClick={() => setOpen(true)} data-due-change-open title={waiting ? "A date change is already waiting for an admin" : undefined}>
          <CalendarClock aria-hidden />
          {due ? "Change date" : "Set a due date"}
        </Button>
      </span>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{due ? "Change the due date" : "Set a due date"}</DialogTitle>
            <DialogDescription>
              {immediate ? "The change is recorded with your reason and takes effect at once." : "Every due-date change needs a reason and an admin's approval. The task keeps its date until an admin approves."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) submit();
            }}
          >
            <Field
              id="due-change-date"
              label="New due date"
              error={blockedByRepeat ? "This task repeats, so it needs a due date. Stop the repeat first." : undefined}
              hint={
                kind === null ? (
                  `Now: ${dayOrNone(due, today)}.`
                ) : (
                  <span data-due-change-kind={kind}>
                    <strong className="font-medium text-foreground">{DUE_CHANGE_LABELS[kind]}</strong>: {dayOrNone(due, today)} → {dayOrNone(to, today)}. {DUE_CHANGE_HINTS[kind]}
                  </span>
                )
              }
            >
              <div className="flex items-center gap-2">
                <Input id="due-change-date" type="date" className="w-full max-w-44" value={date} onChange={(event) => setDate(event.target.value)} />
                {due !== null && date !== "" ? (
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setDate("")}>
                    Remove the date
                  </Button>
                ) : null}
              </div>
            </Field>
            <Field id="due-change-reason" label="Why is the date changing?" hint="Kept in the task's history." count={{ value: reason, max: LIMITS.dueChangeReason }}>
              <Textarea id="due-change-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={LIMITS.dueChangeReason} placeholder="e.g. The vendor's API key arrives on the 28th" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !ready}>
                {pending ? "Saving…" : immediate ? "Change the date" : "Ask an admin"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * A change that waits for an admin: what it is, the dates, the reason and who asked, with the buttons the viewer may
 * press. `withTask` adds the task's name as a link (the Proposals page lists changes from many tasks).
 */
export function PendingDueChangeCard({ change, today, canDecide, canWithdraw, withTask = false }: { change: PendingDueChange; today: string; canDecide: boolean; canWithdraw: boolean; withTask?: boolean }) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const approve = () => startTransition(async () => void toastResult(await decideDueChange({ changeId: change.id, decision: "approved" })));
  const decline = () =>
    startTransition(async () => {
      if (toastResult(await decideDueChange({ changeId: change.id, decision: "declined", note }))) setDeclining(false);
    });
  const withdraw = () => startTransition(async () => void toastResult(await withdrawDueChange({ changeId: change.id })));
  return (
    <div className="grid gap-2 rounded-lg border border-status-awaiting-dot/30 bg-status-awaiting-bg px-3 py-2.5 text-[13px]" data-due-change={change.id} data-due-change-kind={change.kind}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          {withTask ? (
            <Link href={`/tasks/${change.taskId}`} className="font-medium text-foreground underline-offset-4 hover:underline">
              {change.taskTitle}
            </Link>
          ) : null}
          <p className="font-medium text-status-awaiting-fg">
            {withTask ? "" : "Date change waiting for an admin · "}
            {DUE_CHANGE_LABELS[change.kind]}: {dayOrNone(change.from, today)} → {dayOrNone(change.to, today)}
          </p>
          <p className="break-words text-foreground">{change.reason}</p>
          <p className="text-[12px] text-muted-foreground">
            Asked by {nameOf(change.requestedBy)} on {formatDay(change.requestedDay, today)}
            {withTask && change.project ? ` · ${change.project}` : ""} · the task keeps its date until this is decided
          </p>
        </div>
        {canDecide || canWithdraw ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canDecide ? (
              <>
                <Button type="button" size="sm" disabled={pending} onClick={approve} data-due-change-approve>
                  <Check aria-hidden />
                  Approve
                </Button>
                <Button type="button" size="sm" variant="outline" className="bg-background" disabled={pending} onClick={() => setDeclining(true)} data-due-change-decline>
                  <X aria-hidden />
                  Decline
                </Button>
              </>
            ) : null}
            {canWithdraw ? (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={withdraw} data-due-change-withdraw>
                <Undo2 aria-hidden />
                Withdraw
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <Dialog
        open={declining}
        onOpenChange={(next) => {
          setDeclining(next);
          if (!next) setNote("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline the date change</DialogTitle>
            <DialogDescription>The task keeps the due date it has. {nameOf(change.requestedBy)} is told, with your note.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (note.trim() !== "") decline();
            }}
          >
            <Field id="due-change-decline-note" label="Why is it declined?" count={{ value: note, max: LIMITS.dueChangeReason }}>
              <Textarea id="due-change-decline-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={LIMITS.dueChangeReason} autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || note.trim() === ""}>
                {pending ? "Saving…" : "Decline"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
