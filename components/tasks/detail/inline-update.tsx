"use client";

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
    <div ref={sectionRef} id="update-progress" className="scroll-mt-20 border-t bg-muted/30 px-5 py-4 md:px-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">Update progress</h2>
        {fresh ? (
          <span className="text-xs text-muted-foreground">Leave a note for whoever picks this up next, including you.</span>
        ) : (
          <span className="hidden text-xs text-muted-foreground sm:inline">Press U from anywhere on this page.</span>
        )}
      </div>
      <UpdateProgressForm key={`${context.task.status}-${context.task.assigneeIds.join(",")}-${context.task.nextAction ?? ""}`} context={context} progressRef={progressRef} />
    </div>
  );
}
