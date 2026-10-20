import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { TaskListItem } from "@/lib/tasks/types";
import { TaskList } from "./task-list";

// A titled, counted group of task rows (My Work groups, Home and Team panels).

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A titled group of task rows with a count (My Work groups, Home and Team panels, a project's statuses).
 * `reasonless` hides the reason chips; `total` + `seeAllHref` add a "See all" link when `items` is a capped slice.
 */
export function TaskSection({
  title,
  items,
  today,
  reasonless = false,
  id = slug(title),
  description,
  total = items.length,
  seeAllHref,
  empty,
  readOnly = false,
}: {
  title: string;
  items: TaskListItem[];
  today: string;
  reasonless?: boolean;
  id?: string;
  description?: string;
  total?: number;
  seeAllHref?: string;
  /** Shown instead of rows when the section is empty; without it an empty section renders nothing. */
  empty?: ReactNode;
  readOnly?: boolean;
}) {
  if (items.length === 0 && empty === undefined) return null;
  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-0.5">
        <div className="flex items-baseline gap-2">
          <h2 id={`${id}-heading`} className="text-base font-semibold">
            {title}
          </h2>
          <span className="text-[13px] text-muted-foreground tabular-nums" aria-label={`${total} tasks`}>
            {total}
          </span>
        </div>
        {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-4 py-5 text-base text-muted-foreground">{empty}</div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <TaskList page={{ items, nextCursor: null }} today={today} showReason={!reasonless} readOnly={readOnly} />
          {seeAllHref && total > items.length ? (
            <Link
              href={seeAllHref}
              className="flex items-center justify-center gap-1.5 border-t px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              See all {total}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
