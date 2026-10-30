"use client";

import { cn } from "cn";
import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { Fragment, useState, useTransition } from "react";
import { loadHistory, setCommentResolved } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { nameOf } from "@/lib/tasks/people";
import type { HistoryItem, HistoryPage } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";
import { CommentForm } from "./comment-form";

// Comments and history on the task page, newest first, 20 at a time. A comment is open until someone resolves
// it, and a task with an open comment can't be completed (docs/PLAN.md, 2026-10-30 log).

/** Resolve / Reopen on one comment, for people who may work on the task. */
function ResolveButton({ taskId, item }: { taskId: string; item: HistoryItem }) {
  const [pending, startTransition] = useTransition();
  const resolved = item.resolved !== null;
  return (
    <Button
      type="button"
      size="sm"
      variant={resolved ? "ghost" : "outline"}
      className={cn("h-7 shrink-0 text-[13px]", resolved && "text-muted-foreground")}
      disabled={pending}
      aria-label={`${resolved ? "Reopen" : "Resolve"} the comment by ${nameOf(item.actor)}`}
      onClick={() => startTransition(async () => void toastResult(await setCommentResolved({ taskId, commentId: item.id, resolved: !resolved })))}
    >
      {resolved ? <RotateCcw aria-hidden /> : <CheckCircle2 aria-hidden />}
      {pending ? "Saving…" : resolved ? "Reopen" : "Resolve"}
    </Button>
  );
}

function Entry({ taskId, item, canResolve }: { taskId: string; item: HistoryItem; canResolve: boolean }) {
  const comment = item.type === "comment";
  const resolved = comment && item.resolved !== null;
  return (
    <li className="flex gap-3 py-2.5">
      <UserAvatar name={item.actor.name} email={item.actor.email} image={item.actor.image} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 text-base">
            <span className="font-medium">{nameOf(item.actor)}</span> <span className="text-muted-foreground">{item.phrase}</span>
          </p>
          <time dateTime={item.at} title={item.absolute} className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {item.time}
          </time>
        </div>
        {item.change ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            <span>{item.change.before ?? "None"}</span>
            <ArrowRight className="size-3" aria-label="to" />
            <span className="text-foreground">{item.change.after ?? "None"}</span>
          </p>
        ) : null}
        {item.type === "progress" ? (
          <div className="mt-1.5 grid gap-1 rounded-md bg-muted/60 px-3 py-2 text-base">
            {item.body ? <p className="whitespace-pre-line">{item.body}</p> : null}
            {item.nextAction ? (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground/80">Next:</span> {item.nextAction}
              </p>
            ) : null}
            {item.blocker ? (
              <p className="text-status-blocked-fg">
                <span className="font-medium">Blocked:</span> {item.blocker}
              </p>
            ) : null}
          </div>
        ) : comment ? (
          <div className={cn("mt-1 rounded-md border", resolved ? "border-dashed bg-muted/30" : "border-status-awaiting-dot/40 bg-status-awaiting-bg/40")}>
            <p className={cn("px-3 py-2 text-base whitespace-pre-line", resolved && "text-muted-foreground")}>{item.body}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-inherit px-3 py-1.5 text-[13px]">
              {resolved ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-status-completed-dot" aria-hidden />
                  Resolved by {item.resolved!.by}
                </span>
              ) : (
                <span className="font-medium text-status-awaiting-fg">Open comment</span>
              )}
              {canResolve ? <ResolveButton taskId={taskId} item={item} /> : null}
            </div>
          </div>
        ) : item.note ? (
          <p className="mt-1 text-base text-muted-foreground">“{item.note}”</p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Comments and history, merged newest first and grouped by day, 20 at a time (docs/PLAN.md §5). People who may
 * work on the task get the "Add a comment" box above it and Resolve on each comment; the heading counts what
 * is still open.
 */
export function TaskHistory({ taskId, initial, canComment, openComments }: { taskId: string; initial: HistoryPage; canComment: boolean; openComments: number }) {
  // Earlier pages are keyed to the first page the server sent: after an action refreshes the page, `initial`
  // is a new object, so the list starts over from the fresh first page instead of keeping stale entries.
  const [extra, setExtra] = useState<{ key: HistoryPage; pages: HistoryPage[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const pages = extra !== null && extra.key === initial ? [initial, ...extra.pages] : [initial];
  const items = pages.flatMap((page) => page.items);
  const cursor = pages[pages.length - 1].nextCursor;

  return (
    <section aria-labelledby="history-heading" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 md:px-6">
        <h2 id="history-heading" className="text-base font-semibold">
          Comments and history
        </h2>
        {openComments > 0 ? (
          <span className="rounded-md bg-status-awaiting-bg px-2 py-0.5 text-[13px] font-medium text-status-awaiting-fg tabular-nums">
            {openComments === 1 ? "1 open comment" : `${openComments} open comments`}
          </span>
        ) : null}
      </div>
      {canComment ? (
        <div className="border-b px-5 py-4 md:px-6">
          <CommentForm taskId={taskId} />
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="px-5 py-4 text-base text-muted-foreground md:px-6">Nothing has happened yet.</p>
      ) : (
        <ol className="px-5 py-2 md:px-6">
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {index === 0 || items[index - 1].day !== item.day ? (
                <li className={index === 0 ? "pt-1" : "pt-4"} aria-hidden>
                  <p className="text-[13px] font-medium text-muted-foreground">{item.dayLabel}</p>
                </li>
              ) : null}
              <Entry taskId={taskId} item={item} canResolve={canComment} />
            </Fragment>
          ))}
        </ol>
      )}
      {cursor ? (
        <div className="flex justify-center border-t p-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await loadHistory({ taskId, cursor });
                if (toastResult(result)) setExtra((current) => ({ key: initial, pages: [...(current !== null && current.key === initial ? current.pages : []), result.data] }));
              })
            }
          >
            {pending ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
