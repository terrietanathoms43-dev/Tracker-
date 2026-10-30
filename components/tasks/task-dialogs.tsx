"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { TaskStatus } from "@/lib/constants";
import type { CreateDefaults } from "@/lib/tasks/types";
import { CreateTaskForm } from "./create-task-form";
import { TRANSITION_TITLES, TransitionForm } from "./transition-form";
import { UpdateProgressForm } from "./update-progress-form";
import { useUpdateContext } from "./use-update-context";

// The three dialogs TaskActionsProvider owns: New task, Update progress, and the small status-change dialog.

function Loading() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-9 w-1/2" />
    </div>
  );
}

export function CreateTaskDialog({
  open,
  defaults,
  onCreated,
  onClose,
}: {
  open: boolean;
  defaults: CreateDefaults;
  onCreated?: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription className="sr-only">Only the title is required.</DialogDescription>
        </DialogHeader>
        {open ? <CreateTaskForm
            defaults={defaults}
            onDone={(id) => {
              onCreated?.(id);
              onClose();
            }}
            onCancel={onClose}
          /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function UpdateProgressDialog({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const state = useUpdateContext(taskId);
  return (
    <Dialog open={taskId !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update progress</DialogTitle>
          <DialogDescription className="line-clamp-2 wrap-anywhere">{state?.context?.task.title ?? " "}</DialogDescription>
        </DialogHeader>
        {state === null ? (
          <Loading />
        ) : state.context === null ? (
          <p className="text-base text-destructive">{state.error}</p>
        ) : !state.context.abilities.progress ? (
          <p className="text-base text-muted-foreground">You can follow this task, but only people who work in this workspace can update it.</p>
        ) : (
          <UpdateProgressForm context={state.context} autoFocus onSaved={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TransitionDialog({ target, onClose }: { target: { taskId: string; status: TaskStatus } | null; onClose: () => void }) {
  const state = useUpdateContext(target?.taskId ?? null);
  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto overflow-x-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{target ? (TRANSITION_TITLES[target.status] ?? "Change status") : "Change status"}</DialogTitle>
          <DialogDescription className="line-clamp-2 wrap-anywhere">{state?.context?.task.title ?? " "}</DialogDescription>
        </DialogHeader>
        {target === null || state === null ? (
          <Loading />
        ) : state.context === null ? (
          <p className="text-base text-destructive">{state.error}</p>
        ) : (
          <TransitionForm context={state.context} status={target.status} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
