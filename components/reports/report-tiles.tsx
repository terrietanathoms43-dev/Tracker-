import { cn } from "cn";
import Link from "next/link";
import type { ReportSummary } from "@/lib/reports/build";
import type { ReportProject } from "@/lib/reports/params";
import { tasksHref } from "@/lib/tasks/filters";

// The Workload view's headline counts, negative first (docs/PLAN.md, 2026-11-01 log): what is overdue, blocked or
// stalled, who has nothing to do, then what was delivered. Each is a link to the rows behind it; problem counts are
// tinted only above zero, with the status tokens.

type Tile = { label: string; value: number; href: string; tone: "problem" | "waiting" | "plain" };

export function ReportTiles({ summary, project }: { summary: ReportSummary; project: ReportProject }) {
  const tiles: Tile[] = [
    { label: "Overdue now", value: summary.overdue, href: tasksHref({ due: "overdue", project }), tone: "problem" },
    { label: "Blocked now", value: summary.blocked, href: tasksHref({ status: ["blocked"], project }), tone: "problem" },
    { label: "Stalled", value: summary.stalled, href: "#stalled", tone: "problem" },
    { label: "Idle people", value: summary.idlePeople, href: "#people", tone: "waiting" },
    { label: "Delivered in range", value: summary.delivered, href: tasksHref({ status: ["completed"], sort: "updated", project }), tone: "plain" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="The report in numbers">
      {tiles.map(({ label, value, href, tone }, index) => {
        const tinted = value > 0 && tone !== "plain";
        const problem = tinted && tone === "problem";
        const waiting = tinted && tone === "waiting";
        return (
          <li key={label} className={cn(index === 0 && "col-span-2 sm:col-span-1")}>
            <Link
              href={href}
              className={cn(
                "block rounded-lg border px-4 py-3 transition-colors break-inside-avoid",
                problem && "border-status-blocked-dot/30 bg-status-blocked-bg hover:bg-status-blocked-bg/70",
                waiting && "border-status-awaiting-dot/30 bg-status-awaiting-bg hover:bg-status-awaiting-bg/70",
                !tinted && "bg-card hover:bg-accent/60",
              )}
            >
              <p className={cn("truncate text-[13px]", problem ? "text-status-blocked-fg" : waiting ? "text-status-awaiting-fg" : "text-muted-foreground")}>{label}</p>
              <p className={cn("mt-1 text-2xl font-semibold", problem && "text-status-blocked-fg", waiting && "text-status-awaiting-fg")}>{value}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
