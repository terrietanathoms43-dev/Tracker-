"use client";

import { cn } from "cn";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteTask } from "@/actions/tasks";
import { PriorityGlyph } from "@/components/priority-glyph";
import { RelativeTime } from "@/components/relative-time";
import { AssigneeStack } from "@/components/tasks/assignee-stack";
import { DueLabel } from "@/components/tasks/due-label";
import { ApprovalChain, DecideButtons, ResubmitButton } from "@/components/tasks/proposal-strip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { PROPOSAL_STATUS_LABELS } from "@/lib/constants";
import type { ProposalListItem } from "@/lib/dal/approvals";
import { nameOf } from "@/lib/tasks/people";
import { toastResult } from "@/lib/toast-result";

// One proposal per row (docs/PLAN.md, 2026-11-03 log): what was asked, by whom, where it would go, where the chain
// stands, and the buttons for whoever may act: Approve / Decline for the person who is up, Send again or Withdraw
// for the proposer of a declined one.

function WithdrawButton({ item }: { item: ProposalListItem }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden />
        Withdraw
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw this proposal?</DialogTitle>
            <DialogDescription>&ldquo;{item.title}&rdquo; is removed for good. You can propose it again later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  if (toastResult(await deleteTask({ taskId: item.id }))) setOpen(false);
                })
              }
            >
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProposalRow({ item, today, now, timeZone, showProposer = true }: { item: ProposalListItem; today: string; now: Date; timeZone: string; showProposer?: boolean }) {
  const where = [item.project?.name, item.goal?.title].filter(Boolean).join(" › ") || "Standalone task";
  const declinedStep = item.steps.find((step) => step.decision === "declined");
  return (
    <li className="grid gap-2 px-4 py-3" data-proposal-row={item.id} data-proposal-status={item.status}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/tasks/${item.id}`} className="text-base font-semibold underline-offset-4 hover:underline">
              {item.title}
            </Link>
            <PriorityGlyph priority={item.priority} className="relative" />
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                item.status === "pending" && "bg-status-awaiting-bg text-status-awaiting-fg",
                item.status === "approved" && "bg-status-completed-bg text-status-completed-fg",
                item.status === "declined" && "bg-status-blocked-bg text-status-blocked-fg",
              )}
            >
              {PROPOSAL_STATUS_LABELS[item.status]}
            </span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            {showProposer ? (
              <span className="inline-flex items-center gap-1.5">
                <UserAvatar name={item.proposer.name} email={item.proposer.email} image={item.proposer.image} size="sm" className="size-5" />
                {nameOf(item.proposer)}
              </span>
            ) : null}
            {showProposer ? <span aria-hidden>·</span> : null}
            <span>{where}</span>
            {item.dueDate ? (
              <>
                <span aria-hidden>·</span>
                <DueLabel due={item.dueDate} today={today} status="not_started" />
              </>
            ) : null}
            <span aria-hidden>·</span>
            <RelativeTime date={new Date(item.createdAt)} timeZone={timeZone} now={now} />
          </p>
          {item.description ? <p className="mt-1.5 line-clamp-2 max-w-prose text-[13px] text-muted-foreground">{item.description}</p> : null}
          {item.status === "declined" && declinedStep?.note ? (
            <p className="mt-1.5 text-[13px] text-status-blocked-fg">
              Declined{declinedStep.decidedBy ? ` by ${nameOf(declinedStep.decidedBy)}` : ""}: {declinedStep.note}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AssigneeStack assignees={item.assignees} className="relative" />
          {item.canDecide ? <DecideButtons taskId={item.id} seen={item.updatedAt} /> : null}
          {item.isMine && item.status === "declined" ? <ResubmitButton taskId={item.id} /> : null}
          {item.isMine && item.status !== "approved" ? <WithdrawButton item={item} /> : null}
        </div>
      </div>
      <ApprovalChain steps={item.steps} currentId={item.current?.id ?? null} />
    </li>
  );
}

export function ProposalList({ items, today, now, timeZone, showProposer = true }: { items: ProposalListItem[]; today: string; now: Date; timeZone: string; showProposer?: boolean }) {
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <ProposalRow key={item.id} item={item} today={today} now={now} timeZone={timeZone} showProposer={showProposer} />
      ))}
    </ul>
  );
}
