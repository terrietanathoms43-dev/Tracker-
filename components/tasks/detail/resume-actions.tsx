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

/**
 * The approver's two buttons on an awaiting task: Approve completes it; Send back returns it with a note.
 * Approving is held while comments are open (the same rule as completing), and the button says why.
 */
export function ApprovalActions({ taskId, openComments = 0 }: { taskId: string; openComments?: number }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const held = openComments > 0;

  const approve = () => startTransition(async () => void toastResult(await changeStatus({ taskId, status: "completed", via: "approve" })));
  const sendBack = () =>
    startTransition(async () => {
      if (toastResult(await changeStatus({ taskId, status: "in_progress", via: "send_back", note }))) {
        setOpen(false);
        setNote("");
      }
    });

  const approveButton = (
    <Button size="sm" className="flex-1 sm:flex-none" disabled={pending || held} aria-disabled={held || undefined} onClick={approve}>
      <Check aria-hidden />
      {pending ? "Saving…" : "Approve"}
    </Button>
  );

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Button size="sm" variant="outline" className="flex-1 bg-background sm:flex-none" disabled={pending} onClick={() => setOpen(true)}>
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
          <TooltipContent>{openCommentsMessage(openComments)}</TooltipContent>
        </Tooltip>
      ) : (
        approveButton
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send it back</DialogTitle>
            <DialogDescription>The task returns to In progress with your note on it.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              sendBack();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && note.trim() !== "") {
                event.preventDefault();
                sendBack();
              }
            }}
          >
            <Field id="send-back-note" label="What needs to change?" count={{ value: note, max: LIMITS.sendBackNote }}>
              <Textarea id="send-back-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={LIMITS.sendBackNote} autoFocus placeholder="e.g. The rollback step is missing from the runbook" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || note.trim() === ""}>
                {pending ? "Sending…" : "Send back"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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
