"use client";

import { useState, useTransition } from "react";
import { changeStatus } from "@/actions/tasks";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TaskStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { nameOf, roleSuffix } from "@/lib/tasks/people";
import type { UpdateContext } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";

// The small status-change dialog's form: exactly the fields the new status needs.

export const TRANSITION_TITLES: Partial<Record<TaskStatus, string>> = {
   blocked: "Mark as blocked",
   awaiting_approval: "Send for approval",
   completed: "Mark as completed",
   rejected: "Reject this task",
};

/** Exactly the fields a status asks for (apex-ux flow D): a reason, an approver, or an optional summary and evidence. */
export function TransitionForm({ context, status, onDone }: { context: UpdateContext; status: TaskStatus; onDone: () => void }) {
   const { task, people } = context;
   const [reason, setReason] = useState("");
   const [blockedBy, setBlockedBy] = useState("");
   const [approverId, setApproverId] = useState(context.defaultApprover ?? "");
   const [summary, setSummary] = useState("");
   const [evidenceUrl, setEvidenceUrl] = useState("");
   const [evidenceLabel, setEvidenceLabel] = useState("");
   const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
   const [pending, startTransition] = useTransition();
   const ready =
      status === "blocked" || status === "rejected" ? reason.trim() !== "" : status === "awaiting_approval" ? approverId !== "" : true;

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
         {status === "blocked" ? (
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
         {status === "rejected" ? (
            <Field id="transition-reason" label="Why is it rejected?" hint="Kept in the task's history." error={errors.reason?.[0]} count={{ value: reason, max: LIMITS.blockedReason }}>
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
         {status === "awaiting_approval" ? (
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
         {status === "completed" ? (
            <>
               <Field id="transition-summary" label="Completion summary" hint="Optional: what changed, and why it matters." count={{ value: summary, max: LIMITS.completionSummary }}>
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
            <Button type="submit" variant={status === "rejected" ? "destructive" : "default"} disabled={pending || !ready}>
               {pending ? "Saving…" : (TRANSITION_TITLES[status] ?? "Save")}
            </Button>
         </div>
      </form>
   );
}
