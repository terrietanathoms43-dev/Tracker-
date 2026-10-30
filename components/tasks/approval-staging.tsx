"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ExternalLink, MessageSquareWarning, ShieldCheck, Undo2 } from "lucide-react";
import { changeStatus } from "@/actions/tasks";
import { Field } from "@/components/field";
import { PriorityGlyph } from "@/components/priority-glyph";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalStagingTask } from "@/lib/dal/tasks";
import { LIMITS } from "@/lib/limits";
import { describeAssignees } from "@/lib/tasks/assignees";
import { openCommentsMessage } from "@/lib/tasks/transitions";
import { toastResult } from "@/lib/toast-result";

// A leader's Home: the tasks waiting for sign-off, with the facts (progress, summary, evidence, open comments)
// in front of the Approve button, so nothing is approved on a hunch.

export function ApprovalStaging({ tasks }: { tasks: ApprovalStagingTask[] }) {
  const [selectedTask, setSelectedTask] = useState<ApprovalStagingTask | null>(null);
  const [sendBackNote, setSendBackNote] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleApprove = (taskId: string) => {
    setPendingId(taskId);
    startTransition(async () => {
      toastResult(await changeStatus({ taskId, status: "completed", via: "approve" }));
      setPendingId(null);
    });
  };

  const handleSendBack = () => {
    if (!selectedTask || sendBackNote.trim() === "") return;
    const taskId = selectedTask.id;
    setPendingId(taskId);
    startTransition(async () => {
      const ok = toastResult(
        await changeStatus({
          taskId,
          status: "in_progress",
          via: "send_back",
          note: sendBackNote.trim(),
        }),
      );
      if (ok) {
        setSelectedTask(null);
        setSendBackNote("");
      }
      setPendingId(null);
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-[13px] text-muted-foreground">
        <ShieldCheck className="size-5 shrink-0 text-status-completed-dot" aria-hidden />
        <div>
          <span className="font-medium text-foreground">Nothing is waiting for approval.</span> Tasks sent for sign-off show up here with their evidence.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-status-awaiting-dot" aria-hidden />
          <h3 className="text-sm font-semibold tracking-tight">Waiting for approval</h3>
          <span className="rounded-md bg-status-awaiting-bg px-2 py-0.5 text-xs font-semibold text-status-awaiting-fg tabular-nums">{tasks.length}</span>
        </div>
        <p className="text-[12px] text-muted-foreground">Read the evidence before signing off</p>
      </div>

      <div className="divide-y">
        {tasks.map((task) => {
          const isPending = pendingId === task.id;
          const held = task.openComments > 0;

          return (
            <div key={task.id} className="p-4 transition-colors hover:bg-muted/20">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/tasks/${task.id}`} className="text-base font-semibold text-foreground hover:underline">
                      {task.title}
                    </Link>
                    <PriorityGlyph priority={task.priority} className="relative" />
                    {task.project ? <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">{task.project.name}</span> : null}
                  </div>

                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Assigned: <span className="font-medium text-foreground">{describeAssignees(task.assignees)}</span>
                    {task.dueDate ? ` · Due ${task.dueDate}` : ""}
                  </p>

                  <div className="mt-3 rounded-md border border-border/80 bg-muted/40 p-3 text-[13px]">
                    <div className="text-[12px] font-semibold text-muted-foreground">Delivered work and progress</div>
                    <div className="mt-1 whitespace-pre-wrap text-foreground">{task.completionSummary || task.latestProgress || "No written progress summary provided."}</div>
                    {task.nextAction ? (
                      <div className="mt-2 text-[12px] text-muted-foreground">
                        <span className="font-medium text-foreground">Next action:</span> {task.nextAction}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-medium text-muted-foreground">Evidence:</span>
                    {task.evidence.length === 0 ? (
                      <span className="text-[12px] text-muted-foreground italic">No evidence links attached</span>
                    ) : (
                      task.evidence.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-2xs hover:bg-accent"
                        >
                          <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
                          <span>{link.label || link.url}</span>
                        </a>
                      ))
                    )}
                  </div>

                  {held ? (
                    <Link href={`/tasks/${task.id}#history-heading`} className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-status-awaiting-fg underline-offset-4 hover:underline">
                      <MessageSquareWarning className="size-4" aria-hidden />
                      {openCommentsMessage(task.openComments)}
                    </Link>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 pt-2 sm:pt-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => {
                      setSelectedTask(task);
                      setSendBackNote("");
                    }}
                  >
                    <Undo2 className="size-3.5" aria-hidden />
                    Send back
                  </Button>
                  <Button size="sm" disabled={isPending || held} title={held ? openCommentsMessage(task.openComments) : undefined} onClick={() => handleApprove(task.id)}>
                    <Check className="size-3.5" aria-hidden />
                    {isPending ? "Approving…" : "Approve"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={selectedTask !== null} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send back for revisions</DialogTitle>
            <DialogDescription>Explain what changes or additional evidence are required before this task can be approved.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendBack();
            }}
          >
            <Field id="staging-sendback-note" label="What needs to change?" count={{ value: sendBackNote, max: LIMITS.sendBackNote }}>
              <Textarea
                id="staging-sendback-note"
                value={sendBackNote}
                onChange={(e) => setSendBackNote(e.target.value)}
                rows={3}
                maxLength={LIMITS.sendBackNote}
                autoFocus
                placeholder="e.g. Please attach the test results or fix the edge case in the handler."
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setSelectedTask(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={sendBackNote.trim() === "" || pendingId !== null}>
                {pendingId ? "Sending…" : "Send back to In progress"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
