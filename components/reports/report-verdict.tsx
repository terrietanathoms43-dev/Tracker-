import { cn } from "cn";
import { CheckCircle2, OctagonAlert } from "lucide-react";
import Link from "next/link";
import type { ReportSummary } from "@/lib/reports/build";
import type { ReportProject } from "@/lib/reports/params";
import { tasksHref } from "@/lib/tasks/filters";

// The first thing the Executive view says (docs/PLAN.md, 2026-11-01 log): is anything wrong, and how much. One
// sentence, then five counts, each a link to the rows behind it. Problem counts are tinted only above zero, with the
// status tokens; a report with nothing wrong says so in green and stops shouting.

type Tile = { label: string; value: number; href: string; tone: "problem" | "waiting" | "plain" };

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 things need attention: 1 delayed or at risk, 2 blocked." or "Nothing needs intervention right now." */
function verdictSentence(summary: ReportSummary): { ok: boolean; text: string } {
  const parts: string[] = [];
  if (summary.problems > 0) parts.push(`${summary.problems} delayed or at risk`);
  if (summary.blocked > 0) parts.push(`${summary.blocked} blocked`);
  if (summary.overdue > 0) parts.push(`${summary.overdue} overdue`);
  if (summary.stalled > 0) parts.push(`${summary.stalled} stalled`);
  if (summary.decisions > 0) parts.push(`${plural(summary.decisions, "decision")} waiting`);
  if (parts.length === 0) return { ok: true, text: "All clear. Nothing needs your intervention right now." };
  const total = summary.problems + summary.blocked + summary.overdue + summary.stalled + summary.decisions;
  return { ok: false, text: `${plural(total, "thing")} need${total === 1 ? "s" : ""} attention: ${parts.join(", ")}.` };
}

/** The one line the page leads with, then the counts behind it. "Am I cool, or should I be doing something?" */
export function ReportVerdict({ summary, project }: { summary: ReportSummary; project: ReportProject }) {
  const verdict = verdictSentence(summary);
  const tiles: Tile[] = [
    { label: "Delayed or at risk", value: summary.problems, href: "#health", tone: "problem" },
    { label: "Blocked now", value: summary.blocked, href: tasksHref({ status: ["blocked"], project }), tone: "problem" },
    { label: "Overdue now", value: summary.overdue, href: tasksHref({ due: "overdue", project }), tone: "problem" },
    { label: "Stalled", value: summary.stalled, href: "#stalled", tone: "problem" },
    { label: "Decisions waiting", value: summary.decisions, href: "#decisions", tone: "waiting" },
    { label: "Delivered in range", value: summary.delivered, href: tasksHref({ status: ["completed"], sort: "updated", project }), tone: "plain" },
  ];
  return (
    <section aria-label="At a glance" className="grid gap-3">
      <p
        role="status"
        className={cn(
          "flex items-center gap-3 rounded-lg border px-5 py-4 text-lg font-semibold md:text-xl",
          verdict.ok ? "border-status-completed-dot/30 bg-status-completed-bg text-status-completed-fg" : "border-status-blocked-dot/30 bg-status-blocked-bg text-status-blocked-fg",
        )}
      >
        {verdict.ok ? <CheckCircle2 className="size-6 shrink-0" aria-hidden /> : <OctagonAlert className="size-6 shrink-0" aria-hidden />}
        {verdict.text}
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="The report in numbers">
        {tiles.map(({ label, value, href, tone }) => {
          const tinted = value > 0 && tone !== "plain";
          const problem = tinted && tone === "problem";
          const waiting = tinted && tone === "waiting";
          return (
            <li key={label}>
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
    </section>
  );
}
