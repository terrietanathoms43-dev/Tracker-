"use client";

import { cn } from "cn";
import { Check, ClipboardCheck, Send, X } from "lucide-react";
import { useState, useTransition } from "react";
import { decideProposal, resubmitProposal } from "@/actions/proposals";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ProposalStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { nameOf } from "@/lib/tasks/people";
import type { ApprovalStepView } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";

// A proposal's state at the top of its task page (docs/PLAN.md, 2026-11-03 log): where the chain stands, and the
// buttons for whoever is up (Approve / Decline with a note) or for the proposer of a declined one (Send again).

const stepName = (step: ApprovalStepView) => (step.user ? nameOf(step.user) : "any leader or admin");

/** "Terri Tan ✓ → Max Reid (up next) → Avery Admin" as chips, so the whole chain is visible at once. */
export function ApprovalChain({ steps, currentId, className }: { steps: ApprovalStepView[]; currentId: string | null; className?: string }) {
  if (steps.length === 0) return null;
  return (
    <ol className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="Sign-off chain">
      {steps.map((step, index) => {
        const current = step.id === currentId;
        return (
          <li key={step.id} className="flex items-center gap-1.5">
            {index > 0 ? <span className="text-muted-foreground" aria-hidden>→</span> : null}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-medium",
                step.decision === "approved" && "border-status-completed-dot/40 bg-status-completed-bg text-status-completed-fg",
                step.decision === "declined" && "border-status-blocked-dot/40 bg-status-blocked-bg text-status-blocked-fg",
                step.decision === null && current && "border-status-awaiting-dot/50 bg-status-awaiting-bg text-status-awaiting-fg",
                step.decision === null && !current && "text-muted-foreground",
              )}
            >
              {step.decision === "approved" ? <Check className="size-3" aria-hidden /> : step.decision === "declined" ? <X className="size-3" aria-hidden /> : null}
              {stepName(step)}
              {step.decision === null && current ? <span className="font-normal opacity-80">· up next</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Approve / Decline for the person whose step is up. Declining asks for a note the proposer reads. */
export function DecideButtons({ taskId, size = "sm", onDone }: { taskId: string; size?: "sm" | "default"; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const approve = () =>
    startTransition(async () => {
      if (toastResult(await decideProposal({ taskId, decision: "approved" }))) onDone?.();
    });
  const decline = () =>
    startTransition(async () => {
      if (toastResult(await decideProposal({ taskId, decision: "declined", note }))) {
        setOpen(false);
        setNote("");
        onDone?.();
      }
    });
  return (
    <div className="flex items-center gap-2" data-decide-proposal>
      <Button size={size} variant="outline" className="bg-background" disabled={pending} onClick={() => setOpen(true)}>
        <X aria-hidden />
        Decline
      </Button>
      <Button size={size} disabled={pending} onClick={approve}>
        <Check aria-hidden />
        {pending ? "Saving…" : "Approve"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline this proposal</DialogTitle>
            <DialogDescription>The proposer reads your note, can change the task, and send it again.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              decline();
            }}
          >
            <Field id={`decline-note-${taskId}`} label="Why?" count={{ value: note, max: LIMITS.approvalNote }}>
              <Textarea id={`decline-note-${taskId}`} value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={LIMITS.approvalNote} autoFocus placeholder="e.g. Not this quarter: the budget is spoken for" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending || note.trim() === ""}>
                {pending ? "Declining…" : "Decline"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "Send again" for the proposer of a declined proposal. */
export function ResubmitButton({ taskId }: { taskId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="outline" className="bg-background" disabled={pending} onClick={() => startTransition(async () => void toastResult(await resubmitProposal({ taskId })))}>
      <Send aria-hidden />
      {pending ? "Sending…" : "Send again"}
    </Button>
  );
}

/**
 * The strip at the top of a proposal's task page: waiting (with the chain and, for whoever is up, Approve /
 * Decline) or declined (with the note and, for the proposer, Send again). Nothing for a task that is live.
 */
export function ProposalStrip({
  taskId,
  status,
  steps,
  canDecide,
  canResubmit,
}: {
  taskId: string;
  status: ProposalStatus | null;
  steps: ApprovalStepView[];
  canDecide: boolean;
  canResubmit: boolean;
}) {
  if (status !== "pending" && status !== "declined") return null;
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const current = ordered.find((step) => step.decision === null) ?? null;
  const declined = ordered.find((step) => step.decision === "declined") ?? null;
  if (status === "declined") {
    return (
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-status-blocked-dot/30 bg-status-blocked-bg px-5 py-3 text-status-blocked-fg md:px-6" data-proposal-strip="declined">
        <X className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 basis-48 text-base">
          <p>
            <span className="font-medium">Proposal declined</span>
            {declined?.decidedBy ? ` by ${nameOf(declined.decidedBy)}` : ""}
            {declined?.note ? ` · ${declined.note}` : ""}
          </p>
          <p className="mt-0.5 text-[13px] opacity-80">{canResubmit ? "Change what was asked, then send it for sign-off again." : "The proposer can change it and send it again."}</p>
        </div>
        {canResubmit ? <ResubmitButton taskId={taskId} /> : null}
      </div>
    );
  }
  return (
    <div className="grid gap-2 border-b border-status-awaiting-dot/30 bg-status-awaiting-bg px-5 py-3 text-status-awaiting-fg md:px-6" data-proposal-strip="pending">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ClipboardCheck className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 basis-48 text-base">
          <span className="font-medium">Proposal</span>
          {current ? ` · waiting for ${stepName(current)} to sign off (step ${current.position} of ${ordered.length})` : " · waiting for sign-off"}
        </p>
        {canDecide ? <DecideButtons taskId={taskId} /> : null}
      </div>
      <ApprovalChain steps={ordered} currentId={current?.id ?? null} />
      <p className="text-[13px] opacity-80">It becomes a live task, and the people on it are told, once every step is signed.</p>
    </div>
  );
}
