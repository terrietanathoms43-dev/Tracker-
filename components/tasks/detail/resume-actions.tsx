"use client";

import { Check, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { changeStatus } from "@/actions/tasks";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LIMITS } from "@/lib/limits";
import { openCommentsMessage } from "@/lib/tasks/transitions";
import { toastResult } from "@/lib/toast-result";

// The buttons inside the Resume card's status strip: Approve, Send back, Mark unblocked.

/** A small dialog with one required note and a submit: Approve and Send back are the same form with different words. */
function NoteDialog({
  open,
  onOpenChange,
  title,
  description,
  fieldId,
  label,
  placeholder,
  submitLabel,
  pendingLabel,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The note field's id, so each dialog can be found by scripts and labels. */
  fieldId: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const ready = note.trim() !== "";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setNote("");
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) onSubmit(note);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && ready) {
              event.preventDefault();
              onSubmit(note);
            }
          }}
        >
          <Field id={fieldId} label={label} count={{ value: note, max: LIMITS.sendBackNote }}>
            <Textarea id={fieldId} value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={LIMITS.sendBackNote} autoFocus placeholder={placeholder} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !ready}>
              {pending ? pendingLabel : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The approver's two buttons on an awaiting task: Approve completes it with a sign-off note (required, 2026-11-07
 * log: the note stands as the completion summary); Send back returns it with a note on what must change.
 * Approving is held while comments are open (the same rule as completing), and the button says why.
 */
export function ApprovalActions({ taskId, openComments = 0, commentsWaitingOnTasks = 0 }: { taskId: string; openComments?: number; commentsWaitingOnTasks?: number }) {
  const [dialog, setDialog] = useState<"approve" | "send_back" | null>(null);
  const [pending, startTransition] = useTransition();
  const held = openComments > 0;

  const approve = (note: string) =>
    startTransition(async () => {
      if (toastResult(await changeStatus({ taskId, status: "completed", via: "approve", note }))) setDialog(null);
    });
  const sendBack = (note: string) =>
    startTransition(async () => {
      if (toastResult(await changeStatus({ taskId, status: "in_progress", via: "send_back", note }))) setDialog(null);
    });

  const approveButton = (
    <Button size="sm" className="flex-1 sm:flex-none" disabled={pending || held} aria-disabled={held || undefined} onClick={() => setDialog("approve")}>
      <Check aria-hidden />
      Approve
    </Button>
  );

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Button size="sm" variant="outline" className="flex-1 bg-background sm:flex-none" disabled={pending} onClick={() => setDialog("send_back")}>
        <Undo2 aria-hidden />
        Send back
      </Button>
      {held ? (
        <Tooltip>
          {/* A disabled button fires no pointer events, so the tooltip hangs off a wrapper. */}
          <TooltipTrigger asChild>
            <span className="flex flex-1 sm:flex-none" tabIndex={0}>
              {approveButton}
            </span>
          </TooltipTrigger>
          <TooltipContent>{openCommentsMessage(openComments, commentsWaitingOnTasks)}</TooltipContent>
        </Tooltip>
      ) : (
        approveButton
      )}
      <NoteDialog
        open={dialog === "approve"}
        onOpenChange={(open) => setDialog(open ? "approve" : null)}
        title="Approve it"
        description="The task is completed with your sign-off note on it, as its completion summary."
        fieldId="approve-note"
        label="Sign-off note"
        placeholder="e.g. Checked the runbook steps against the staging deploy; all pass"
        submitLabel="Approve"
        pendingLabel="Saving…"
        pending={pending}
        onSubmit={approve}
      />
      <NoteDialog
        open={dialog === "send_back"}
        onOpenChange={(open) => setDialog(open ? "send_back" : null)}
        title="Send it back"
        description="The task returns to In progress with your note on it."
        fieldId="send-back-note"
        label="What needs to change?"
        placeholder="e.g. The rollback step is missing from the runbook"
        submitLabel="Send back"
        pendingLabel="Sending…"
        pending={pending}
        onSubmit={sendBack}
      />
    </div>
  );
}

/** Clears a blocker: the task goes back to In progress and the history records who unblocked it. */
export function UnblockButton({ taskId }: { taskId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="w-full bg-background sm:w-auto"
      disabled={pending}
      onClick={() => startTransition(async () => void toastResult(await changeStatus({ taskId, status: "in_progress" })))}
    >
      {pending ? "Saving…" : "Mark unblocked"}
    </Button>
  );
}
