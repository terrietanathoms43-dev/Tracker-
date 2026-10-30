import { cn } from "cn";
import Link from "next/link";
import { REPORT_CUT_LABELS, REPORT_CUTS, reportHref, type ReportCut } from "@/lib/reports/params";
import type { ReportRange } from "@/lib/reports/range";

// The report's three views. The active one wears the brand colour, exactly like the active date preset beside it,
// so a glance says which view is open in either theme.

export function ReportCutTabs({ current, range, canSwitch }: { current: ReportCut; range: ReportRange; canSwitch: boolean }) {
  if (!canSwitch) return null;
  return (
    <nav aria-label="Report view" className="flex flex-wrap gap-1.5" data-print-hide>
      {REPORT_CUTS.map((cut) => {
        const on = cut === current;
        return (
          <Link
            key={cut}
            href={reportHref("/reports", range, { cut })}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-md border px-2.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {REPORT_CUT_LABELS[cut]}
          </Link>
        );
      })}
    </nav>
  );
}
