"use client";

import { cn } from "cn";
import { Flag } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, type MouseEventHandler, type ReactNode } from "react";

// A goal's "Everything completed" task (docs/PLAN.md, 2026-11-09 log) never stands alone as that bare title: wherever
// it is listed it carries a chip naming the goal it marks achieved, which is also the way to that goal. Under the
// goal's own heading (the goal page, a block of the Goals list) the name would only repeat the heading, so the chip
// says what the task does instead.

const GoalHome = createContext<string | null>(null);

/** Wraps the tasks listed under one goal's own heading: that goal's closer says "Marks this goal achieved" there. */
export function CloserHome({ goalId, children }: { goalId: string; children: ReactNode }) {
  return <GoalHome.Provider value={goalId}>{children}</GoalHome.Provider>;
}

/**
 * The chip beside a closer's title: a flag and "Goal: Ship onboarding", linking to the goal. `variant="header"` is
 * the task page's larger chip, which spells it out: "Marks “Ship onboarding” achieved". `variant="card"` is a board
 * card's: plain text, because the card is already a link. Where room is short (a phone's row, a board column) the
 * goal's name takes a second line instead of being cut off, and a phone's row leaves "Goal:" to the flag (screen
 * readers still hear it), since the name is the point of the chip.
 */
export function CloserChip({
  goal,
  variant = "row",
  onClick,
  className,
}: {
  goal: { id: string; title: string };
  variant?: "row" | "header" | "card";
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}) {
  const here = useContext(GoalHome) === goal.id;
  const header = variant === "header";
  const text = here ? (
    "Marks this goal achieved"
  ) : header ? (
    `Marks “${goal.title}” achieved`
  ) : (
    <>
      <span className={variant === "row" ? "max-md:sr-only" : undefined}>Goal: </span>
      {goal.title}
    </>
  );
  const hint = `Completing this task marks the goal “${goal.title}” achieved`;
  const classes = cn(
    "inline-flex min-w-0 max-w-full items-start gap-1 rounded-md bg-primary/10 font-medium text-primary",
    header ? "min-h-6 px-2 py-0.5 text-[13px] leading-5" : "min-h-5 px-1.5 py-0.5 text-[11px] leading-4",
    className,
  );
  const body = (
    <>
      <Flag className={cn("shrink-0", header ? "mt-[3px] size-3.5" : "mt-0.5 size-3")} aria-hidden />
      <span className={cn("wrap-anywhere", variant === "row" ? "line-clamp-2 md:line-clamp-1" : "line-clamp-2")}>{text}</span>
    </>
  );
  if (variant === "card" || here) {
    return (
      <span className={classes} title={hint} data-closer-chip>
        {body}
      </span>
    );
  }
  return (
    <Link href={`/goals/${goal.id}`} prefetch={false} onClick={onClick} className={cn(classes, "outline-none hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring")} title={hint} data-closer-chip>
      {body}
    </Link>
  );
}
