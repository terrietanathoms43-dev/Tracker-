"use client";

import { ChevronDown, Lock, NotebookPen, X } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { attachDraft } from "@/actions/drafts";
import { noteDraftTask } from "@/components/draft/notepad-store";
import { Button } from "@/components/ui/button";
import { draftName, type TaskDraft } from "@/lib/drafts";
import { toastResult } from "@/lib/toast-result";

// "Your drafts" on a task page (docs/PLAN.md, 2026-11-11 log): the drafts the person reading the page attached to
// this task from their Draft tab, so the working notes are where the work is. Private: the page asks for the
// viewer's own drafts only, so nobody else ever gets this section, and nothing here is part of the task's record.
// Each opens in place to be read; writing happens on the Draft tab (or the floating notepad), one click away.

function DraftEntry({ draft, open }: { draft: TaskDraft & { updated: string }; open: boolean }) {
  const [pending, startTransition] = useTransition();
  const name = draftName(draft);
  const detach = () =>
    startTransition(async () => {
      if (toastResult(await attachDraft({ id: draft.id, taskId: "" }))) noteDraftTask(draft.id, null);
    });
  return (
    <li className="py-2.5" data-task-draft={draft.id}>
      <details className="group" open={open}>
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-base font-medium">{name}</span>
          <span className="shrink-0 text-[13px] text-muted-foreground">Updated {draft.updated}</span>
        </summary>
        <div className="mt-2 grid gap-2 pl-6">
          {draft.body.trim() === "" ? (
            <p className="text-base text-muted-foreground">Nothing written in it yet.</p>
          ) : (
            <p className="max-h-80 overflow-y-auto rounded-md bg-muted/60 px-3 py-2 text-base whitespace-pre-line" data-task-draft-body>
              {draft.body}
              {draft.truncated ? "…" : ""}
            </p>
          )}
          {draft.truncated ? <p className="text-[13px] text-muted-foreground">This is the start of it; the rest is on the Draft tab.</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/home?view=draft&draft=${draft.id}`}>
                <NotebookPen aria-hidden />
                Open in Drafts
              </Link>
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={pending} onClick={detach} aria-label={`Detach the draft ${name} from this task`}>
              <X aria-hidden />
              {pending ? "Detaching…" : "Detach"}
            </Button>
          </div>
        </div>
      </details>
    </li>
  );
}

/** The viewer's own drafts attached to the task; rendered only when they have any. */
export function TaskDrafts({ drafts }: { drafts: (TaskDraft & { updated: string })[] }) {
  if (drafts.length === 0) return null;
  return (
    <section aria-labelledby="task-drafts-heading" className="rounded-xl border bg-card" data-task-drafts>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 md:px-6">
        <h2 id="task-drafts-heading" className="flex items-baseline gap-2 text-base font-semibold">
          Your drafts
          <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{drafts.length}</span>
        </h2>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Only you can see these
        </span>
      </div>
      <ul className="divide-y px-5 py-1 md:px-6">
        {drafts.map((draft) => (
          <DraftEntry key={draft.id} draft={draft} open={drafts.length === 1} />
        ))}
      </ul>
    </section>
  );
}
