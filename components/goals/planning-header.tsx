import { cn } from "cn";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { TaskProgress } from "@/lib/tasks/types";
import { ProgressBar } from "./progress-bar";

// The top of a goal or project page: back link, title, the leader's actions, a meta line, then a card with what it
// is for and the large progress bar.

/** Back link, title with `actions` beside it (wrapping under it on a phone), and a one-line `meta` summary. */
export function PlanningHeader({ back, title, actions, meta }: { back: { href: string; label: string }; title: string; actions?: ReactNode; meta: ReactNode }) {
  return (
    <header className="mb-5">
      <Link href={back.href} className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {back.label}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <h1 className="min-w-0 flex-1 basis-72 text-xl leading-snug font-semibold tracking-tight break-words md:text-2xl">{title}</h1>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">{meta}</div>
    </header>
  );
}

/**
 * What it is for (a goal's success criteria lead in larger type) and how far along it is. Counts only, from the
 * tasks underneath: the page's answer to "how far along is this?".
 */
export function PlanningSummary({ successCriteria, description, progress }: { successCriteria?: string | null; description: string | null; progress: TaskProgress }) {
  const hasText = Boolean(successCriteria || description);
  return (
    <section aria-label="Progress" className="rounded-lg border bg-card p-4 md:p-5">
      {successCriteria ? (
        <>
          <p className="text-xs text-muted-foreground">Success looks like</p>
          <p className="mt-1 max-w-prose text-base font-medium whitespace-pre-line">{successCriteria}</p>
        </>
      ) : null}
      {description ? <p className={cn("max-w-prose text-sm whitespace-pre-line", successCriteria && "mt-3 text-muted-foreground")}>{description}</p> : null}
      <ProgressBar {...progress} size="lg" className={hasText ? "mt-5" : undefined} />
    </section>
  );
}
