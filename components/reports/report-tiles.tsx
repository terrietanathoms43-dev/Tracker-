import { cn } from "cn";
import type { ReportSummary } from "@/lib/reports/build";

// The report's five headline counts. Counts of records, nothing derived from them.

type Tile = { label: string; value: number; problem?: boolean };

export function ReportTiles({ summary }: { summary: ReportSummary }) {
  const tiles: Tile[] = [
    { label: "Delivered", value: summary.delivered },
    { label: "Open, due in range", value: summary.openDueInRange },
    { label: "Blocked now", value: summary.blocked, problem: true },
    { label: "Overdue now", value: summary.overdue, problem: true },
    { label: "Progress updates", value: summary.progressUpdates },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="The report in numbers">
      {tiles.map(({ label, value, problem }, index) => {
        const tinted = problem === true && value > 0;
        return (
          <li
            key={label}
            className={cn(
              "rounded-lg border px-4 py-3 break-inside-avoid",
              tinted ? "border-status-blocked-dot/30 bg-status-blocked-bg" : "bg-card",
              index === 0 && "col-span-2 sm:col-span-1",
            )}
          >
            <p className={cn("truncate text-xs", tinted ? "text-status-blocked-fg" : "text-muted-foreground")}>{label}</p>
            <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tinted && "text-status-blocked-fg")}>{value}</p>
          </li>
        );
      })}
    </ul>
  );
}
