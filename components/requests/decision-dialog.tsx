"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { decideRequest } from "@/actions/requests";
import { getTaskFormOptions } from "@/actions/tasks";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RequestDecision, RequestStatus, RequestUrgency, TaskPriority } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { PRIORITY_FOR_URGENCY } from "@/lib/requests/decisions";
import type { AssigneeIds } from "@/lib/tasks/assignees";
import type { TaskFormOptions } from "@/lib/tasks/types";
import { TaskFields } from "./task-fields";

// The small dialog behind every decision: it asks only for what that decision needs (apex-ux §5).

/** What a decision control needs to know about the request. */
export type DecisionTarget = { id: string; title: string; status: RequestStatus; urgency: RequestUrgency };

type Errors = Record<string, string[] | undefined>;

const COPY: Record<RequestDecision, { title: string; reasonLabel: string; reasonHint: string; submit: string }> = {
  approved: { title: "Approve this request", reasonLabel: "Note for the requester", reasonHint: "Optional: why it's worth doing.", submit: "Approve" },
  deferred: { title: "Defer this request", reasonLabel: "Why not now?", reasonHint: "Optional. The requester sees this.", submit: "Defer" },
  rejected: { title: "Reject this request", reasonLabel: "Why not?", reasonHint: "The requester sees this.", submit: "Reject request" },
  converted: { title: "Convert to a task", reasonLabel: "Note for the requester", reasonHint: "Optional.", submit: "Create task" },
  reopened: { title: "Reopen this request", reasonLabel: "What changed?", reasonHint: "Optional. It goes back to Needs a decision.", submit: "Reopen" },
};

/** The form for one decision. Keyed by the decision, so switching decisions starts from a clean form. */
function DecisionForm({ request, decision, onDone }: { request: DecisionTarget; decision: RequestDecision; onDone: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [deferUntil, setDeferUntil] = useState("");
  const [createNow, setCreateNow] = useState(false);
  const [assignment, setAssignment] = useState<AssigneeIds>({ assigneeIds: [], teamIds: [] });
  const [priority, setPriority] = useState<TaskPriority>(PRIORITY_FOR_URGENCY[request.urgency]);
  const [dueDate, setDueDate] = useState("");
  const [options, setOptions] = useState<TaskFormOptions | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const copy = COPY[decision];
  const withTask = decision === "converted" || (decision === "approved" && createNow);
  const reasonRequired = decision === "rejected";

  useEffect(() => {
    if (!withTask || options !== null) return;
    let live = true;
    getTaskFormOptions().then((result) => {
      if (!live) return;
      if (result.ok) setOptions(result.data);
      else setErrors({ assigneeIds: [result.error] });
    });
    return () => {
      live = false;
    };
  }, [withTask, options]);

  function submit() {
    if (pending || (reasonRequired && reason.trim() === "")) return;
    startTransition(async () => {
      const result = await decideRequest({
        requestId: request.id,
        decision,
        reason,
        deferUntil: decision === "deferred" ? deferUntil : "",
        createTask: withTask ? { ...assignment, priority, dueDate } : undefined,
      });
      if (!result.ok) {
        // A field's error shows under it; anything else (a stale screen, no permission) is a toast.
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      const taskId = result.data.taskId;
      toast.success(result.message, taskId ? { action: { label: "Open task", onClick: () => router.push(`/tasks/${taskId}`) } } : undefined);
      onDone();
    });
  }

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
      {decision === "approved" ? (
        <div className="flex items-center gap-2">
          <Checkbox id="decision-create-now" checked={createNow} onCheckedChange={(checked) => setCreateNow(checked === true)} />
          <Label htmlFor="decision-create-now" className="font-normal">
            Create the task now
          </Label>
        </div>
      ) : null}
      {withTask ? (
        <TaskFields
          options={options}
          assignment={assignment}
          onAssignment={setAssignment}
          priority={priority}
          onPriority={setPriority}
          dueDate={dueDate}
          onDueDate={setDueDate}
          errors={errors}
        />
      ) : null}
      {decision === "deferred" ? (
        <Field id="decision-defer" label="Revisit on" hint="Optional. It comes back to the top of Deferred on this day." error={errors.deferUntil?.[0]}>
          <Input id="decision-defer" type="date" value={deferUntil} onChange={(event) => setDeferUntil(event.target.value)} aria-invalid={errors.deferUntil ? true : undefined} />
        </Field>
      ) : null}
      <Field id="decision-reason" label={copy.reasonLabel} hint={copy.reasonHint} error={errors.reason?.[0]} count={{ value: reason, max: LIMITS.decisionReason }}>
        <Textarea
          id="decision-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={LIMITS.decisionReason}
          autoFocus={decision !== "approved" && decision !== "converted"}
          aria-invalid={errors.reason ? true : undefined}
        />
      </Field>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant={decision === "rejected" ? "destructive" : "default"} disabled={pending || (reasonRequired && reason.trim() === "")}>
          {pending ? "Saving…" : decision === "approved" && createNow ? "Approve and create task" : copy.submit}
        </Button>
      </div>
    </form>
  );
}

/** One decision on one request, in a dialog. `decision` null means closed. */
export function DecisionDialog({ request, decision, onClose }: { request: DecisionTarget; decision: RequestDecision | null; onClose: () => void }) {
  return (
    <Dialog open={decision !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {decision !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>{COPY[decision].title}</DialogTitle>
              <DialogDescription className="line-clamp-2">{request.title}</DialogDescription>
            </DialogHeader>
            <DecisionForm key={decision} request={request} decision={decision} onDone={onClose} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
