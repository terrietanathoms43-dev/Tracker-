"use client";

import { PenLine } from "lucide-react";
import { useEffect, useRef } from "react";
import type { UpdateContext } from "@/lib/tasks/types";
import { FOCUS_UPDATE_EVENT } from "../task-actions";
import { UpdateProgressForm } from "../update-progress-form";

// The Update progress form at the foot of the Resume card, focused by U.

/**
 * The Update progress form at the foot of the Resume card. The U key, the header button and the palette all
 * dispatch FOCUS_UPDATE_EVENT, which scrolls here and puts the cursor in Latest progress.
 */
export function InlineUpdate({ context, fresh }: { context: UpdateContext; fresh: boolean }) {
  const progressRef = useRef<HTMLTextAreaElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function focus() {
      sectionRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      progressRef.current?.focus({ preventScroll: true });
    }
    window.addEventListener(FOCUS_UPDATE_EVENT, focus);
    return () => window.removeEventListener(FOCUS_UPDATE_EVENT, focus);
  }, []);

  return (
    <div ref={sectionRef} id="update-progress" className="scroll-mt-20 border-t-2 border-primary/40 bg-primary/5 px-5 py-4 md:px-6" data-update-progress>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden>
            <PenLine className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Update progress</h2>
            <p className="text-[13px] text-muted-foreground">
              {fresh ? "Leave a note for whoever picks this up next, including you: " : ""}
              what you did, what happens next, and the status this update leaves the task in. Then Save update.
            </p>
          </div>
        </div>
        <span className="hidden text-[13px] text-muted-foreground sm:inline">Press U from anywhere on this page.</span>
      </div>
      <UpdateProgressForm key={`${context.task.status}-${context.task.assigneeIds.join(",")}-${context.task.nextAction ?? ""}`} context={context} progressRef={progressRef} />
    </div>
  );
}
