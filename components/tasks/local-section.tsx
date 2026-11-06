"use client";

import { ArrowRight, Lock, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { bulkSendLocal } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import type { TaskListItem } from "@/lib/tasks/types";
import { SelectionProvider, useTaskSelection } from "./selection";
import { TaskList } from "./task-list";

// The Local section (docs/PLAN.md, 2026-11-06 log): the viewer's own local tasks, apart from the main board on every
// screen that lists tasks (the List and Board tabs, My Work, Home). It is there only while there are any. Its rows
// tick like any others, but its actions are its own: Select all, Deselect, and one button that sends the ticked
// tasks on (for sign-off, or published where no sign-off applies); with nothing ticked it sends every task shown.

/** Rows plus the header with the section's own actions. Renders nothing without items. */
export function LocalTasksSection({
  items,
  today,
  total = items.length,
  seeAllHref,
  description,
}: {
  items: TaskListItem[];
  today: string;
  /** How many there are in all, when `items` is a capped slice. */
  total?: number;
  /** Where the rest are, when `items` is a capped slice. */
  seeAllHref?: string;
  description?: string;
}) {
  if (items.length === 0) return null;
  return (
    <SelectionProvider bar={false}>
      <section aria-labelledby="local-tasks-heading" className="min-w-0" data-local-section>
        <LocalHeader items={items} total={total} description={description} />
        <div className="overflow-hidden rounded-lg border border-dashed bg-card">
          <TaskList page={{ items, nextCursor: null }} today={today} showReason={false} />
          {seeAllHref && total > items.length ? (
            <Link href={seeAllHref} className="flex items-center justify-center gap-1.5 border-t px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              See all {total}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </section>
    </SelectionProvider>
  );
}

const plural = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`;

function LocalHeader({ items, total, description }: { items: TaskListItem[]; total: number; description?: string }) {
  const selection = useTaskSelection();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ticked = selection === null ? 0 : selection.selected.size;
  // With nothing ticked, the button acts on every task shown, and says so.
  const chosen = ticked > 0 && selection !== null ? items.filter((item) => selection.selected.has(item.id)) : items;
  const signOff = chosen.filter((item) => item.needsSignOff).length;
  const publish = chosen.length - signOff;
  const count = ticked > 0 ? `${chosen.length}` : `all ${chosen.length}`;
  const label = publish === 0 ? `Send ${count} for sign-off` : signOff === 0 ? `Publish ${count}` : `Send ${count} on`;

  function send() {
    startTransition(async () => {
      const result = await bulkSendLocal({ taskIds: chosen.map((item) => item.id) });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.failed.length > 0) toast.warning(result.message ?? `Some of the ${plural(chosen.length)} couldn't be sent.`, { duration: 8000 });
      else toast.success(result.message ?? "Sent.");
      selection?.clear();
      router.refresh();
    });
  }

  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-0.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <h2 id="local-tasks-heading" className="inline-flex items-center gap-1.5 text-base font-semibold">
            <Lock className="size-4 text-muted-foreground" aria-hidden />
            Local
          </h2>
          <span className="text-[13px] text-muted-foreground tabular-nums" aria-label={`${total} tasks`}>
            {total}
          </span>
        </div>
        <p className="text-[13px] text-muted-foreground">{description ?? "Only you can see these; they aren't on the main board. Send them for sign-off when they're ready."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" data-local-actions>
        {selection !== null && ticked < items.length ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={pending} onClick={selection.selectAll} data-local-select-all>
            Select all
          </Button>
        ) : null}
        {selection !== null && ticked > 0 ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={pending} onClick={selection.clear} data-local-deselect>
            Deselect
          </Button>
        ) : null}
        <Button size="sm" variant={ticked > 0 ? "default" : "outline"} disabled={pending} onClick={send} data-local-send={publish === 0 ? "sign-off" : signOff === 0 ? "publish" : "mixed"}>
          <Send aria-hidden />
          {pending ? "Sending…" : label}
        </Button>
      </div>
    </div>
  );
}
