import Link from "next/link";
import { reportHref } from "@/lib/reports/params";
import type { ReportRange } from "@/lib/reports/range";

export type ReportCut = "exec" | "leader" | "member";

export function ReportCutTabs({
  current,
  range,
  canSwitch,
}: {
  current: ReportCut;
  range: ReportRange;
  canSwitch: boolean;
}) {
  if (!canSwitch) return null;

  const cuts: { id: ReportCut; label: string }[] = [
    { id: "exec", label: "Executive Health" },
    { id: "leader", label: "Team & Workload" },
    { id: "member", label: "My Work" },
  ];

  return (
    <div className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-1 text-[13px] print:hidden">
      {cuts.map((cut) => {
        const on = cut.id === current;
        const href = `${reportHref("/reports", range)}&cut=${cut.id}`;
        return (
          <Link
            key={cut.id}
            href={href}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              on
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {cut.label}
          </Link>
        );
      })}
    </div>
  );
}
