"use client";

import { MessageSquareText, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { changeStatus } from "@/actions/tasks";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import type { TaskDetail, TaskRef } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";

// Where a task made from a comment came from, said on its own page (docs/PLAN.md, 2026-11-11 log). A link, not a
// sub-task: the card shows the comment and the task it is on, and whether the comment is still open. The comment
// waits for this task and resolves itself when this task is closed; reopening this task opens it again. When the
// task the comment is on is closed in any way, it can be reopened from here: finishing the smaller piece is often
// when someone sees the bigger one was not done after all. A viewer who may not read that task sees neither its
// title nor the comment's words.

/** "Reopen that task": puts the task the comment is on back to In progress. */
function ReopenButton({ task }: { task: TaskRef }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={pending} data-reopen-upstream={task.id} onClick={() => startTransition(async () => void toastResult(await changeStatus({ taskId: task.id, status: "in_progress" })))}>
      <RotateCcw aria-hidden />
      {pending ? "Reopening…" : "Reopen that task"}
    </Button>
  );
}

/** What the comment is waiting for, from where this task stands. */
function stateLine(fromComment: NonNullable<TaskDetail["fromComment"]>, closed: boolean): string {
  const others = fromComment.otherOpen === 1 ? "1 other task made from it" : `${fromComment.otherOpen} other tasks made from it`;
  if (fromComment.resolved) return closed ? "That comment is resolved: closing this task resolved it. Reopening this task opens it again." : "That comment is resolved.";
  if (closed) return fromComment.otherOpen > 0 ? `That comment is still open: it waits for ${others}.` : "That comment is open.";
  const also = fromComment.otherOpen > 0 ? ` It waits for ${others} too.` : "";
  return `That comment stays open until this task is closed, then resolves itself; until then the task it is on cannot be completed.${also}`;
}

export function UpstreamCard({ fromComment, closed }: { fromComment: NonNullable<TaskDetail["fromComment"]>; closed: boolean }) {
  const { task } = fromComment;
  return (
    <aside aria-label="Where this task came from" className="rounded-xl border bg-card px-5 py-3.5 md:px-6" data-from-comment={fromComment.id}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          {task !== null ? (
            <>
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
                <MessageSquareText className="size-4 shrink-0" aria-hidden />
                <span>Made from a comment by {fromComment.author} on</span>
                <Link href={`/tasks/${task.id}`} prefetch={false} className="min-w-0 truncate font-medium text-link underline-offset-4 hover:underline" data-from-comment-task>
                  {task.title}
                </Link>
                <StatusBadge status={task.status} />
              </p>
              {fromComment.excerpt ? <blockquote className="mt-2 line-clamp-3 border-l-2 pl-3 text-sm break-words whitespace-pre-line text-muted-foreground">{fromComment.excerpt}</blockquote> : null}
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                <span data-from-comment-state={fromComment.resolved ? "resolved" : "open"}>{stateLine(fromComment, closed)}</span>
                <Link href={`/tasks/${task.id}#comment-${fromComment.id}`} prefetch={false} className="font-medium text-link underline-offset-4 hover:underline" data-from-comment-link>
                  Go to the comment
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <MessageSquareText className="size-4 shrink-0" aria-hidden />
                <span>Made from a comment on a task you can&apos;t open.</span>
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground" data-from-comment-state={fromComment.resolved ? "resolved" : "open"}>
                {stateLine(fromComment, closed)}
              </p>
            </>
          )}
        </div>
        {task !== null && fromComment.canReopenTask ? <ReopenButton task={task} /> : null}
      </div>
    </aside>
  );
}
