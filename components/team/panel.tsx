import { cn } from "cn";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// The Apex Panel recipe: a bordered card with a title row and an optional "See all" link. Home, Team and
// Reports build their dashboards out of it.

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * A titled card. `count` sits beside the title; `highlight` draws it as the gold badge, which PLAN §9 keeps for
 * Needs attention counts only. `aside` replaces the link with something else (Reports: a CSV download). Lists
 * inside use `divide-y` and bring their own row padding.
 */
export function Panel({
  title,
  count,
  highlight = false,
  href,
  hrefLabel = "See all",
  aside,
  className,
  children,
}: {
  title: string;
  count?: number;
  highlight?: boolean;
  href?: string;
  hrefLabel?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = `${slug(title)}-panel`;
  const link = href ? (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
      {hrefLabel}
      <ArrowRight className="size-3" aria-hidden />
    </Link>
  ) : null;
  return (
    <section aria-labelledby={id} className={cn("min-w-0 overflow-hidden rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 id={id} className="truncate text-sm font-semibold">
            {title}
          </h2>
          {count !== undefined ? (
            <span
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[11px] font-medium tabular-nums",
                highlight && count > 0 ? "bg-highlight text-highlight-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          ) : null}
        </div>
        {aside ?? link}
      </div>
      {children}
    </section>
  );
}

/** The quiet sentence a panel shows when it has nothing to list (the lighter EmptyState of the recipe). */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-5 text-sm text-muted-foreground">{children}</p>;
}
