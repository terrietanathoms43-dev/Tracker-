import { cn } from "cn";
import Link from "next/link";
import { PERIODS, teamHref, type Period } from "@/lib/team/period";

// 7 / 30 / 90 days, drawn like the Segmented control but made of links, so the period lives in the URL and the
// back button and a shared link both reproduce the view.

export function PeriodPicker({ days }: { days: Period }) {
  return (
    <nav aria-label="Period" className="inline-flex rounded-md border bg-background p-0.5">
      {PERIODS.map((period) => {
        const active = period === days;
        return (
          <Link
            key={period}
            href={teamHref(period)}
            replace
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center rounded-[5px] px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {period} days
          </Link>
        );
      })}
    </nav>
  );
}
