"use client";

import { Flag, Link2, MessageSquareText, MessageSquareWarning, Repeat } from "lucide-react";
import { useState, useTransition, type RefObject } from "react";
import { updateProgress } from "@/actions/tasks";
import { CharacterCounter } from "@/components/character-counter";
import { NativeSelect } from "@/components/native-select";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CLOSED_WITHOUT_COMPLETION, isClosedStatus, TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { closerHeldMessage, closerReadyMessage } from "@/lib/tasks/closer";
import { closingResolvesMessage, reopeningMessage } from "@/lib/tasks/comment-tasks";
import { nameOf, roleSuffix } from "@/lib/tasks/people";
import { openCommentsMessage } from "@/lib/tasks/transitions";
import type { UpdateContext } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";

// Update progress: the form behind the product's signature action. One Status control, with the same statuses
// every list, board and report uses (docs/PLAN.md, 2026-11-03 log): picking Blocked asks what blocks it,
// Awaiting approval asks who approves, Completed needs its summary (2026-11-07 log), Rejected, Deferred and
// Cancelled each ask why.

type Choice = "" | TaskStatus;

/**
 * The signature form (docs/BRIEF.md §6): latest progress and next action, then the optional evidence, handover and
 * status. Ctrl/⌘+Enter saves. Completing is held back while the task has open comments, and the form says so where
 * the choice is made.
 */
export function UpdateProgressForm({
  context,
  onSaved,
  autoFocus = false,
  progressRef,
}: {
  context: UpdateContext;
  onSaved?: () => void;
  autoFocus?: boolean;
  progressRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const { task, people, abilities } = context;
  const [progress, setProgress] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [status, setStatus] = useState<Choice>(task.status === "not_started" ? "in_progress" : "");
  const [reason, setReason] = useState(task.status === "blocked" ? (task.blockedReason ?? "") : "");
  const [blockedBy, setBlockedBy] = useState(task.status === "blocked" ? (task.blockedBy ?? "") : "");
  const [showEvidence, setShowEvidence] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [handOverTo, setHandOverTo] = useState("");
  const [approverId, setApproverId] = useState(context.defaultApprover ?? "");
  const [summary, setSummary] = useState("");
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  const field = (name: string) => `${name}-${task.id}`;
  const current = task.assigneeIds.map((id) => people.find((person) => person.id === id)).filter((person) => person !== undefined);
  // Who will be on the task after this update: the handover target alone, or whoever is on it now.
  const assigneesAfter = handOverTo ? [handOverTo] : task.assigneeIds;
  const keepLabel =
    current.length === 0
      ? "Keep unassigned"
      : current.length === 1
        ? `Keep with ${nameOf(current[0])}`
        : `Keep with ${current.map((person) => nameOf(person)).join(", ")}`;
  const effective: TaskStatus = status === "" ? task.status : status;
  const completing = effective === "completed" && task.status !== "completed";
  const merging = effective === "merged" && task.status !== "merged";
  /** Closing without completing: rejected, deferred or cancelled, each with its reason (a merge names its parent by itself). */
  const closingWithReason = CLOSED_WITHOUT_COMPLETION.includes(effective) && effective !== "merged" && task.status !== effective;
  const closing = completing || closingWithReason || merging;
  // The same rules the server applies (lib/tasks/transitions.ts, sub-tasks), shown before the save instead of after it.
  const heldByComments = completing && task.openComments > 0;
  const heldBySubTasks = completing && task.openSubTasks > 0;
  // A goal's "Everything completed" task is its last step (2026-11-09 log): it waits for every other task under the goal.
  const heldByGoal = completing && task.closer !== null && task.closer.openOthers > 0;
  const held = heldByComments || heldBySubTasks || heldByGoal;
  const summaryMissing = completing && !held && summary.trim() === "";
  // Made from a comment (2026-11-11 log): what closing or reopening it does to that comment, said before the save.
  const reopening = isClosedStatus(task.status) && !isClosedStatus(effective);
  const linkedComment =
    task.fromComment === null ? null : closing && !held && !isClosedStatus(task.status) ? closingResolvesMessage(task.fromComment) : reopening ? reopeningMessage(task.fromComment) : null;
  // The statuses this person may move the task to: completing a task that waits for approval is approving it;
  // rejecting and cancelling are edit rights; only a sub-task can be merged.
  const choices = TASK_STATUSES.filter((each) => {
    if (each === "rejected" || each === "cancelled") return abilities.reject;
    if (each === "completed" && task.status === "awaiting_approval") return abilities.approve;
    if (each === "merged") return task.parent !== null;
    return true;
  });
  // A blocked task that stays blocked may still get its reason brought up to date.
  const blockedFields = effective === "blocked";

  function submit() {
    startTransition(async () => {
      const result = await updateProgress({
        taskId: task.id,
        progress,
        nextAction,
        status,
        reason: blockedFields || closingWithReason ? reason : "",
        blockedBy: blockedFields ? blockedBy : "",
        evidenceUrl: showEvidence ? evidenceUrl.trim() : "",
        evidenceLabel: showEvidence ? evidenceLabel : "",
        handOverTo,
        approverId: status === "awaiting_approval" ? approverId : "",
        summary: completing ? summary : "",
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toastResult(result);
        return;
      }
      toastResult(result);
      setErrors({});
      setProgress("");
      setNextAction("");
      setEvidenceUrl("");
      setEvidenceLabel("");
      setShowEvidence(false);
      setHandOverTo("");
      setSummary("");
      onSaved?.();
    });
  }

  const error = (key: string) =>
    errors[key]?.[0] ? (
      <p className="text-[13px] text-destructive" id={`${field(key)}-error`}>
        {errors[key]?.[0]}
      </p>
    ) : null;

  return (
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
      <div className="grid gap-2">
        <Label htmlFor={field("progress")}>Latest progress</Label>
        <Textarea
          id={field("progress")}
          ref={progressRef}
          value={progress}
          onChange={(event) => setProgress(event.target.value)}
          placeholder="What did you get done?"
          rows={3}
          autoFocus={autoFocus}
          maxLength={LIMITS.progressNote}
          aria-invalid={errors.progress ? true : undefined}
        />
        <div className="flex items-start justify-between gap-3">
          {error("progress") ?? <span />}
          <CharacterCounter value={progress} max={LIMITS.progressNote} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={field("next")}>
          Next action
          {closing ? <span className="font-normal text-muted-foreground">(optional when closing)</span> : null}
        </Label>
        <Textarea
          id={field("next")}
          value={nextAction}
          onChange={(event) => setNextAction(event.target.value)}
          placeholder={task.nextAction ? `Was: ${task.nextAction}` : "What exactly happens next?"}
          rows={2}
          maxLength={LIMITS.nextAction}
          aria-invalid={errors.nextAction ? true : undefined}
        />
        <div className="flex items-start justify-between gap-3">
          {error("nextAction") ?? <span />}
          <CharacterCounter value={nextAction} max={LIMITS.nextAction} />
        </div>
      </div>

      <div className="grid items-start gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={field("status")} className="text-[13px] text-muted-foreground">
            Status after this update
          </Label>
          <div className="flex items-center gap-2">
            <StatusIcon status={effective} />
            <NativeSelect id={field("status")} value={status} className="min-w-0 flex-1" onChange={(event) => setStatus(event.target.value as Choice)} aria-invalid={errors.status ? true : undefined}>
              <option value="">Keep as {TASK_STATUS_LABELS[task.status].toLowerCase()}</option>
              {choices
                .filter((each) => each !== task.status)
                .map((each) => (
                  <option key={each} value={each}>
                    {TASK_STATUS_LABELS[each]}
                  </option>
                ))}
            </NativeSelect>
          </div>
          {error("status")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={field("handover")} className="text-[13px] text-muted-foreground">
            Hand over to
          </Label>
          <NativeSelect id={field("handover")} value={handOverTo} onChange={(event) => setHandOverTo(event.target.value)} title="Hands the task to one person.">
            <option value="">{keepLabel}</option>
            {people
              .filter((person) => !(task.assigneeIds.length === 1 && task.assigneeIds[0] === person.id))
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {nameOf(person)}
                </option>
              ))}
          </NativeSelect>
        </div>
      </div>

      {blockedFields ? (
        <div className="grid items-start gap-3 rounded-md border border-status-blocked-dot/30 bg-status-blocked-bg/60 p-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Input
              aria-label="What's blocking it?"
              placeholder="What's blocking it?"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={LIMITS.blockedReason}
              aria-invalid={errors.reason ? true : undefined}
              className="bg-background"
            />
            <div className="flex items-start justify-between gap-3">
              {error("reason") ?? <span />}
              <CharacterCounter value={reason} max={LIMITS.blockedReason} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Input
              aria-label="Who or what can unblock it?"
              placeholder="Who or what can unblock it? (optional)"
              value={blockedBy}
              onChange={(event) => setBlockedBy(event.target.value)}
              maxLength={LIMITS.blockedBy}
              className="bg-background"
            />
            <div className="flex justify-end">
              <CharacterCounter value={blockedBy} max={LIMITS.blockedBy} />
            </div>
          </div>
        </div>
      ) : null}

      {closingWithReason ? (
        <div className="grid gap-1.5">
          <Textarea
            aria-label={`Why is it ${TASK_STATUS_LABELS[effective].toLowerCase()}?`}
            placeholder={`Why is it ${TASK_STATUS_LABELS[effective].toLowerCase()}? Kept in the task's history.`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={LIMITS.blockedReason}
            aria-invalid={errors.reason ? true : undefined}
          />
          <div className="flex items-start justify-between gap-3">
            {error("reason") ?? <span />}
            <CharacterCounter value={reason} max={LIMITS.blockedReason} />
          </div>
        </div>
      ) : null}

      {status === "awaiting_approval" ? (
        <div className="grid gap-1.5">
          <Label htmlFor={field("approver")} className="text-[13px] text-muted-foreground">
            Who approves it?
          </Label>
          <NativeSelect id={field("approver")} value={approverId} onChange={(event) => setApproverId(event.target.value)} aria-invalid={errors.approverId ? true : undefined}>
            <option value="">Choose an approver…</option>
            {people
              .filter((person) => !assigneesAfter.includes(person.id))
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {nameOf(person)}
                  {roleSuffix(person.role)}
                </option>
              ))}
          </NativeSelect>
          {error("approverId")}
        </div>
      ) : null}

      {heldByComments ? (
        <p className="flex items-start gap-2 rounded-md border border-status-awaiting-dot/30 bg-status-awaiting-bg px-3 py-2 text-[13px] text-status-awaiting-fg" role="status">
          <MessageSquareWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {openCommentsMessage(task.openComments, task.commentsWaitingOnTasks)}{" "}
            {task.commentsWaitingOnTasks > 0 ? `${task.openComments === 1 ? "It is" : "They are"} under Comments and history; keep the task open for now.` : "Resolve them under Comments and history, or keep the task open for now."}
          </span>
        </p>
      ) : null}
      {linkedComment !== null ? (
        <p className="flex items-start gap-2 rounded-md border bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground" role="status" data-closes-comment>
          <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{linkedComment}</span>
        </p>
      ) : null}
      {heldBySubTasks && !heldByComments ? (
        <p className="flex items-start gap-2 rounded-md border border-status-awaiting-dot/30 bg-status-awaiting-bg px-3 py-2 text-[13px] text-status-awaiting-fg" role="status">
          <MessageSquareWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Finish the {task.openSubTasks} open {task.openSubTasks === 1 ? "sub-task" : "sub-tasks"} first, or merge them: this task waits for them.
          </span>
        </p>
      ) : null}
      {heldByGoal && !heldByComments && !heldBySubTasks && task.closer ? (
        <p className="flex items-start gap-2 rounded-md border border-status-awaiting-dot/30 bg-status-awaiting-bg px-3 py-2 text-[13px] text-status-awaiting-fg" role="status" data-closer-hold>
          <Flag className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{closerHeldMessage(task.closer.openOthers, task.closer.goalTitle)}</span>
        </p>
      ) : null}
      {merging && task.parent ? (
        <p className="text-[13px] text-muted-foreground" data-merge-note>
          Folded into <span className="font-medium text-foreground">{task.parent.title}</span>: it closes as Merged and stays listed under it.
        </p>
      ) : null}
      {completing && !held ? (
        <div className="grid gap-1">
          <Textarea
            aria-label="Completion summary"
            placeholder="Completion summary (required): what was done, and why it matters"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={2}
            maxLength={LIMITS.completionSummary}
            aria-invalid={errors.summary ? true : undefined}
          />
          <div className="flex items-center justify-between gap-3">
            {error("summary") ??
              (task.repeats ? (
                <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Repeat className="size-3.5" aria-hidden />
                  Repeats {task.repeats.toLowerCase()}: completing makes the next one.
                </span>
              ) : task.closer ? (
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-primary" data-closer-note>
                  <Flag className="size-3.5 shrink-0" aria-hidden />
                  {closerReadyMessage(task.closer.goalTitle)}
                </span>
              ) : (
                <span className="text-[13px] text-muted-foreground">The sign-off words on the task: what was done.</span>
              ))}
            <CharacterCounter value={summary} max={LIMITS.completionSummary} />
          </div>
        </div>
      ) : null}

      {showEvidence ? (
        <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="grid gap-1.5">
            <Input
              aria-label="Evidence link"
              placeholder="https://…"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              inputMode="url"
              maxLength={LIMITS.url}
              autoFocus
              aria-invalid={errors.evidenceUrl ? true : undefined}
            />
            {error("evidenceUrl")}
          </div>
          <div className="grid gap-1.5">
            <Input aria-label="Evidence label" placeholder="Label (optional)" value={evidenceLabel} onChange={(event) => setEvidenceLabel(event.target.value)} maxLength={LIMITS.evidenceLabel} />
            <div className="flex justify-end">
              <CharacterCounter value={evidenceLabel} max={LIMITS.evidenceLabel} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {!showEvidence ? (
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowEvidence(true)}>
            <Link2 aria-hidden />
            Add evidence link
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <span className="hidden text-[13px] text-muted-foreground sm:inline">Ctrl+Enter to save</span>
          <Button type="submit" disabled={pending || progress.trim() === "" || held || summaryMissing}>
            {pending ? "Saving…" : "Save update"}
          </Button>
        </div>
      </div>
    </form>
  );
}
