"use client";

import { Lock, Send, Upload } from "lucide-react";
import { useTransition } from "react";
import { sendLocalTask } from "@/actions/proposals";
import { Button } from "@/components/ui/button";
import { toastResult } from "@/lib/toast-result";

// A local task's one action (docs/PLAN.md, 2026-11-06 log): send it for sign-off where its goal or project asks for
// it, or publish it where none applies any more. The task page's strip, the row menu and the expanded row all use
// the same button, so the words never differ.

/** "Send for sign-off" when a chain applies, "Publish" when none does. */
export function SendLocalButton({
  taskId,
  needsSignOff,
  size = "sm",
  variant = "default",
  className,
  onDone,
}: {
  taskId: string;
  needsSignOff: boolean;
  size?: "sm" | "default";
  variant?: "default" | "outline";
  className?: string;
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={pending}
      data-send-local={needsSignOff ? "sign-off" : "publish"}
      onClick={() =>
        startTransition(async () => {
          if (toastResult(await sendLocalTask({ taskId }))) onDone?.();
        })
      }
    >
      {needsSignOff ? <Send aria-hidden /> : <Upload aria-hidden />}
      {pending ? (needsSignOff ? "Sending…" : "Publishing…") : needsSignOff ? "Send for sign-off" : "Publish"}
    </Button>
  );
}

/** "Morgan Lead, then Avery Admin" / "any leader or admin": the chain a local task would start, in one line. */
export function describeLocalChain(steps: string[]): string {
  return steps.length <= 1 ? (steps[0] ?? "any leader or admin") : `${steps.slice(0, -1).join(", then ")}, then ${steps[steps.length - 1]}`;
}

/**
 * The strip at the top of a local task's page: whose it is, what sending it on does (and who would sign it), and
 * the button. `chain` is the steps a send would start, as the people who sign each; empty when it would publish.
 */
export function LocalStrip({ taskId, needsSignOff, chain }: { taskId: string; needsSignOff: boolean; chain: string[] }) {
  return (
    <div className="grid gap-2 border-b bg-muted/50 px-5 py-3 md:px-6" data-local-strip={needsSignOff ? "sign-off" : "publish"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 basis-48 text-base">
          <span className="font-medium">Local task</span> · only you can see it. It isn&apos;t on the main board yet.
        </p>
        <SendLocalButton taskId={taskId} needsSignOff={needsSignOff} />
      </div>
      <p className="text-[13px] text-muted-foreground">
        {needsSignOff
          ? `Sending it starts the sign-off: ${describeLocalChain(chain)}. It shows as waiting until every step is signed; then it is live and the people on it are told.`
          : "No sign-off applies here, so publishing makes it a live task at once and tells the people on it."}
      </p>
    </div>
  );
}
