import { cn } from "cn";
import Link from "next/link";
import { REPORT_CUT_LABELS, reportHref, type ReportCut, type ReportProject } from "@/lib/reports/params";
import type { ReportRange, ScopeCadence } from "@/lib/reports/range";

// The report's views, the ones this viewer may open (lib/reports/params.ts `reportCutsFor`). The active one wears
// the brand colour, exactly like the active date preset beside it, so a glance says which view is open in either
// theme. Switching keeps the range and the project. The Active scope's daily cadence (2026-11-12 log) stays on its
// own tab only: a day or two is no range for a chart, so the other views open on their default from there. One
// view alone needs no tabs.

export function ReportCutTabs({
  current,
  cuts,
  range,
  project,
  cadence = null,
}: {
  current: ReportCut;
  cuts: readonly ReportCut[];
  range: ReportRange;
  project: ReportProject;
  cadence?: ScopeCadence | null;
}) {
  if (cuts.length < 2) return null;
  return (
    <nav aria-label="Report view" className="flex flex-wrap gap-1.5" data-print-hide>
      {cuts.map((cut) => {
        const on = cut === current;
        return (
          <Link
            key={cut}
            href={reportHref("/reports", cadence !== null && cut !== "scope" ? null : range, { cut, project, cadence: cut === "scope" ? cadence : null })}
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
