"use client";

import { cn } from "cn";
import { ExternalLink, Link2, MoreHorizontal, NotebookPen } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { StatusIcon } from "@/components/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/constants";
import type { TaskListItem } from "@/lib/tasks/types";
import { StatusMenuItems, useChangeStatus } from "./status-menu";
import { useTaskActions } from "./task-actions";

// The two or three things people do from a list without opening the task (apex-ux §6): Update progress,
// Change status, Copy link. A "⋯" menu with a pointer, a bottom sheet after a long press on touch.

async function copyLink(id: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/tasks/${id}`);
    toast.success("Link copied.");
  } catch {
    toast.error("Couldn't copy the link. Copy it from the address bar instead.");
  }
}

/** The "⋯" menu for a row or a board card. */
export function TaskMenu({ task, className }: { task: TaskListItem; className?: string }) {
  const { openUpdate } = useTaskActions();
  const { change } = useChangeStatus(task.id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${task.title}`}
        className={cn(
          "relative grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => openUpdate(task.id)}>
          <NotebookPen />
          Update progress
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <StatusIcon status={task.status} />
            Change status
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <StatusMenuItems current={task.status} onPick={(status) => change(task.status, status)} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copyLink(task.id)}>
          <Link2 />
          Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SheetButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 items-center gap-3 rounded-md px-3 text-left text-base font-medium hover:bg-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** The same actions as TaskMenu, as a bottom sheet with 44px targets, for touch screens. */
export function TaskActionSheet({ task, open, onOpenChange, readOnly = false }: { task: TaskListItem; open: boolean; onOpenChange: (open: boolean) => void; readOnly?: boolean }) {
  const router = useRouter();
  const { openUpdate } = useTaskActions();
  const { change } = useChangeStatus(task.id);
  const then = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <SheetHeader>
          <SheetTitle className="truncate pr-6">{task.title}</SheetTitle>
          <SheetDescription>{TASK_STATUS_LABELS[task.status]}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-1 px-4">
          {readOnly ? null : (
            <SheetButton onClick={then(() => openUpdate(task.id))}>
              <NotebookPen className="size-4 text-muted-foreground" />
              Update progress
            </SheetButton>
          )}
          <SheetButton onClick={then(() => router.push(`/tasks/${task.id}`))}>
            <ExternalLink className="size-4 text-muted-foreground" />
            Open task
          </SheetButton>
          <SheetButton onClick={then(() => void copyLink(task.id))}>
            <Link2 className="size-4 text-muted-foreground" />
            Copy link
          </SheetButton>
          {readOnly ? null : (
            <>
              <p className="px-3 pt-3 pb-1 text-[13px] text-muted-foreground">Change status</p>
              <div className="grid grid-cols-2 gap-1">
                {TASK_STATUSES.map((status) => (
                  <SheetButton key={status} disabled={status === task.status} onClick={then(() => change(task.status, status))}>
                    <StatusIcon status={status} />
                    {TASK_STATUS_LABELS[status]}
                  </SheetButton>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
