"use client";

import { Flag, MessageSquareWarning } from "lucide-react";
import { useState, useTransition } from "react";
import { changeStatus } from "@/actions/tasks";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { factoryWorded, requiresEditToEnter, statusDef, statusWord, transitionTitle } from "@/lib/statuses";
import { LIMITS } from "@/lib/limits";
import { closerHeldMessage, closerReadyMessage } from "@/lib/tasks/closer";
import { nameOf, roleSuffix } from "@/lib/tasks/people";
import { openCommentsMessage } from "@/lib/tasks/transitions";
import type { UpdateContext } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";

// The small status-change dialog's form: exactly the fields the new status needs.

/** The question each built-in closed status asks while it keeps its name; a renamed or custom closed status goes by its label. */
const CLOSE_PROMPTS: Record<string, { label: string; hint: string }> = {
   rejected: { label: "Why is it rejected?", hint: "Kept in the task's history." },
   deferred: { label: "Why is it deferred?", hint: "Until when, if you know. Kept in the task's history; the task can be reopened later." },
   cancelled: { label: "Why is it cancelled?", hint: "Kept in the task's history. A cancelled task stays for the record; delete it to remove it." },
};

const closePrompt = (def: ReturnType<typeof statusDef>) => (factoryWorded(def) ? CLOSE_PROMPTS[def.key] : undefined);

/**
 * Exactly the fields a status asks for (apex-ux flow D): a reason, an approver, or the completion summary (required,
 * 2026-11-07 log) and optional evidence. Completing a task with open comments is refused by the server
 * (lib/tasks/transitions.ts); the dialog says so instead of offering a Save that fails.
 */
export function TransitionForm({ context, status, onDone }: { context: UpdateContext; status: string; onDone: () => void }) {
   const { task, people } = context;
   const def = statusDef(context.statuses, status);
   const kind = def.kind;
   const [reason, setReason] = useState("");
   const [blockedBy, setBlockedBy] = useState("");
   const [approverId, setApproverId] = useState(context.defaultApprover ?? "");
   const [summary, setSummary] = useState("");
   const [evidenceUrl, setEvidenceUrl] = useState("");
   const [evidenceLabel, setEvidenceLabel] = useState("");
   const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
   const [pending, startTransition] = useTransition();
   const heldByComments = kind === "completed" && task.openComments > 0;
   // Sub-tasks (2026-11-08 log): a parent waits for its open sub-tasks; a merge only works on a sub-task and needs no words.
   const heldBySubTasks = kind === "completed" && task.openSubTasks > 0;
   // A goal's "Everything completed" task is its last step (2026-11-09 log): it waits for every other task under the goal.
   const heldByGoal = kind === "completed" && task.closer !== null && task.closer.openOthers > 0;
   const held = heldByComments || heldBySubTasks || heldByGoal;
   const merging = kind === "merged";
   const closing = kind === "closed";
   const ready =
      kind === "blocked" || closing ? reason.trim() !== "" : kind === "awaiting_approval" ? approverId !== "" : kind === "completed" ? !held && summary.trim() !== "" : merging ? task.parent !== null : true;

   return (
      <form
         className="grid gap-4"
         onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
               const result = await changeStatus({
                  taskId: task.id,
                  status,
                  reason,
                  blockedBy,
                  approverId,
                  summary,
                  evidenceUrl: evidenceUrl.trim(),
                  evidenceLabel,
               });
               if (!result.ok) setErrors(result.fieldErrors ?? {});
               if (toastResult(result)) onDone();
            });
         }}
         onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
               event.preventDefault();
               event.currentTarget.requestSubmit();
            }
         }}
      >
         {kind === "blocked" ? (
            <>
               <Field id="transition-reason" label="What's blocking it?" error={errors.reason?.[0]} count={{ value: reason, max: LIMITS.blockedReason }}>
                  <Textarea
                     id="transition-reason"
                     value={reason}
                     onChange={(event) => setReason(event.target.value)}
                     rows={2}
                     maxLength={LIMITS.blockedReason}
                     autoFocus
                     placeholder="e.g. Waiting for the vendor's fix"
                  />
               </Field>
               <Field id="transition-by" label="Who or what can unblock it?" hint="Optional." count={{ value: blockedBy, max: LIMITS.blockedBy }}>
                  <Input
                     id="transition-by"
                     value={blockedBy}
                     onChange={(event) => setBlockedBy(event.target.value)}
                     placeholder="e.g. Vendor support"
                     maxLength={LIMITS.blockedBy}
                  />
               </Field>
            </>
         ) : null}
         {closing ? (
            <Field id="transition-reason" label={closePrompt(def)?.label ?? `Why is it ${statusWord(def)}?`} hint={closePrompt(def)?.hint ?? "Kept in the task's history."} error={errors.reason?.[0]} count={{ value: reason, max: LIMITS.blockedReason }}>
               <Textarea
                  id="transition-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  maxLength={LIMITS.blockedReason}
                  autoFocus
               />
            </Field>
         ) : null}
         {kind === "awaiting_approval" ? (
            <Field id="transition-approver" label="Who approves it?" error={errors.approverId?.[0]}>
               <NativeSelect id="transition-approver" value={approverId} onChange={(event) => setApproverId(event.target.value)}>
                  <option value="">Choose an approver…</option>
                  {people
                     .filter((person) => !task.assigneeIds.includes(person.id))
                     .map((person) => (
                        <option key={person.id} value={person.id}>
                           {nameOf(person)}
                           {roleSuffix(person.role)}
                        </option>
                     ))}
               </NativeSelect>
            </Field>
         ) : null}
         {heldByComments ? (
            <p className="flex items-start gap-2 rounded-md border border-status-amber-dot/30 bg-status-amber-bg px-3 py-2 text-[13px] text-status-amber-fg" role="status">
               <MessageSquareWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
               <span>{openCommentsMessage(task.openComments)} They are under Comments and history on the task page.</span>
            </p>
         ) : null}
         {heldBySubTasks && !heldByComments ? (
            <p className="flex items-start gap-2 rounded-md border border-status-amber-dot/30 bg-status-amber-bg px-3 py-2 text-[13px] text-status-amber-fg" role="status">
               <MessageSquareWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
               <span>
                  Finish the {task.openSubTasks} open {task.openSubTasks === 1 ? "sub-task" : "sub-tasks"} first, or merge them: this task waits for them.
               </span>
            </p>
         ) : null}
         {heldByGoal && !heldByComments && !heldBySubTasks && task.closer ? (
            <p className="flex items-start gap-2 rounded-md border border-status-amber-dot/30 bg-status-amber-bg px-3 py-2 text-[13px] text-status-amber-fg" role="status" data-closer-hold>
               <Flag className="mt-0.5 size-4 shrink-0" aria-hidden />
               <span>{closerHeldMessage(task.closer.openOthers, task.closer.goalTitle)}</span>
            </p>
         ) : null}
         {merging ? (
            <p className="text-sm text-muted-foreground" data-merge-note>
               {task.parent ? (
                  <>
                     This task is folded into <span className="font-medium text-foreground">{task.parent.title}</span>: it closes as Merged, stays listed under it with its comments and history, and can be reopened or detached later.
                  </>
               ) : (
                  "Only a sub-task can be merged: attach it to the task it duplicates first."
               )}
            </p>
         ) : null}
         {kind === "completed" && !held ? (
            <>
               {task.closer ? (
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-primary" data-closer-note>
                     <Flag className="size-3.5 shrink-0" aria-hidden />
                     {closerReadyMessage(task.closer.goalTitle)}
                  </p>
               ) : null}
               <Field id="transition-summary" label="Completion summary" hint="Required: what was done, and why it matters. These are the sign-off words on the task." error={errors.summary?.[0]} count={{ value: summary, max: LIMITS.completionSummary }}>
                  <Textarea
                     id="transition-summary"
                     value={summary}
                     onChange={(event) => setSummary(event.target.value)}
                     rows={2}
                     maxLength={LIMITS.completionSummary}
                     autoFocus
                  />
               </Field>
               <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <Field id="transition-evidence" label="Evidence link" hint="Optional." error={errors.evidenceUrl?.[0]}>
                     <Input
                        id="transition-evidence"
                        value={evidenceUrl}
                        onChange={(event) => setEvidenceUrl(event.target.value)}
                        placeholder="https://…"
                        inputMode="url"
                        maxLength={LIMITS.url}
                     />
                  </Field>
                  <Field id="transition-evidence-label" label="Label" count={{ value: evidenceLabel, max: LIMITS.evidenceLabel }}>
                     <Input
                        id="transition-evidence-label"
                        value={evidenceLabel}
                        onChange={(event) => setEvidenceLabel(event.target.value)}
                        placeholder="Optional"
                        maxLength={LIMITS.evidenceLabel}
                     />
                  </Field>
               </div>
            </>
         ) : null}
         <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>
               Cancel
            </Button>
            <Button type="submit" variant={requiresEditToEnter(def) ? "destructive" : "default"} disabled={pending || !ready}>
               {pending ? "Saving…" : transitionTitle(def)}
            </Button>
         </div>
      </form>
   );
}
