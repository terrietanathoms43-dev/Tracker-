import { cn } from "cn";
import { AlertTriangle, CalendarX2, CheckCircle2, Clock, GitBranch, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { GoalHealthRow, HealthBoard as HealthBoardData, ProjectHealthRow } from "@/lib/reports/data";
import { HEALTH_LABELS, type HealthStatus } from "@/lib/reports/health";
import { formatDay } from "@/lib/time";

// The health board (docs/PLAN.md, 2026-11-01 log): every goal and project judged by lib/reports/health.ts, the bad
// news first. Rows that are on track fold away under a disclosure as soon as anything isn't, so what needs a
// decision is what the eye lands on. Each verdict ships with an icon and a word, never a colour alone.

const TONE: Record<HealthStatus, { icon: LucideIcon; badge: string; bar: string }> = {
  delayed: { icon: CalendarX2, badge: "border-status-blocked-dot/30 bg-status-blocked-bg text-status-blocked-fg", bar: "bg-status-blocked-dot" },
  at_risk: { icon: AlertTriangle, badge: "border-status-blocked-dot/30 bg-status-blocked-bg text-status-blocked-fg", bar: "bg-status-blocked-dot" },
  needs_attention: { icon: Clock, badge: "border-status-awaiting-dot/30 bg-status-awaiting-bg text-status-awaiting-fg", bar: "bg-status-awaiting-dot" },
  on_track: { icon: CheckCircle2, badge: "border-status-completed-dot/30 bg-status-completed-bg text-status-completed-fg", bar: "bg-status-completed-dot" },
};

export function HealthBadge({ health, className }: { health: HealthStatus; className?: string }) {
  const { icon: Icon, badge } = TONE[health];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap", badge, className)}>
      <Icon className="size-3" aria-hidden />
      {HEALTH_LABELS[health]}
    </span>
  );
}

type Row = { id: string; href: string; name: string; subGoal: boolean; targetDate: string | null; total: number; completed: number; blocked: number; overdue: number; pct: number; health: HealthStatus };

const goalRow = (goal: GoalHealthRow): Row => ({ ...goal, href: `/goals/${goal.id}`, name: goal.title, subGoal: goal.parentGoalId !== null });
const projectRow = (project: ProjectHealthRow): Row => ({ ...project, href: `/projects/${project.id}`, subGoal: false });

function HealthRow({ row, today }: { row: Row; today: string }) {
  const { bar } = TONE[row.health];
  const late = row.health === "delayed" && row.targetDate !== null;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 break-inside-avoid sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {row.subGoal ? <GitBranch className="size-3.5 shrink-0 text-muted-foreground" aria-label="Sub-goal" role="img" /> : null}
          <Link href={row.href} className="text-sm font-medium break-words underline-offset-4 hover:underline">
            {row.name}
          </Link>
          <HealthBadge health={row.health} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span>
            {row.completed} of {row.total} tasks done
          </span>
          {row.blocked > 0 ? <span className="font-medium text-status-blocked-fg">{row.blocked} blocked</span> : null}
          {row.overdue > 0 ? <span className="font-medium text-status-awaiting-fg">{row.overdue} overdue</span> : null}
          {row.targetDate ? (
            <span className={cn(late && "font-medium text-status-blocked-fg")}>
              {late ? "Target passed" : "Target"} {formatDay(row.targetDate, today)}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:w-48 sm:justify-end">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${row.pct}% done`}>
          <div className={cn("h-full", bar)} style={{ width: `${Math.min(row.pct, 100)}%` }} />
        </div>
        <span className="w-10 text-right text-xs font-semibold tabular-nums">{row.pct}%</span>
      </div>
    </li>
  );
}

/** One list, worst first; on-track rows fold away when there is anything else to look at. */
function HealthList({ rows, today, empty }: { rows: Row[]; today: string; empty: string }) {
  if (rows.length === 0) return <p className="px-4 py-4 text-[13px] text-muted-foreground">{empty}</p>;
  const problems = rows.filter((row) => row.health !== "on_track");
  const fine = rows.filter((row) => row.health === "on_track");
  const fold = problems.length > 0 && fine.length > 0;
  return (
    <>
      <ul className="divide-y">
        {(fold ? problems : rows).map((row) => (
          <HealthRow key={row.id} row={row} today={today} />
        ))}
      </ul>
      {fold ? (
        <details className="group border-t">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[13px] text-muted-foreground select-none hover:text-foreground">
            <CheckCircle2 className="size-3.5 text-status-completed-dot" aria-hidden />
            <span className="group-open:hidden">Show {fine.length} on track</span>
            <span className="hidden group-open:inline">Hide {fine.length} on track</span>
          </summary>
          <ul className="divide-y border-t">
            {fine.map((row) => (
              <HealthRow key={row.id} row={row} today={today} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

export function HealthBoard({ data, today }: { data: HealthBoardData; today: string }) {
  const goals = data.goals.map(goalRow);
  const projects = data.projects.map(projectRow);
  const problems = [...goals, ...projects].filter((row) => row.health !== "on_track").length;
  return (
    <section id="health" aria-labelledby="health-board-title" className="scroll-mt-20 overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 id="health-board-title" className="text-base font-semibold">
            Health board
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Delayed: target date passed with work open · At risk: blocked, or a fifth overdue · Needs attention: some work overdue, or behind the pace its target needs
          </p>
        </div>
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums", problems > 0 ? "bg-status-blocked-bg text-status-blocked-fg" : "bg-status-completed-bg text-status-completed-fg")}>
          {problems > 0 ? `${problems} to look at` : "All on track"}
        </span>
      </div>
      <div className="grid md:grid-cols-2 md:divide-x">
        <div>
          <h3 className="border-b bg-muted/40 px-4 py-2 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Goals</h3>
          <HealthList rows={goals} today={today} empty="No active goals." />
        </div>
        <div className="border-t md:border-t-0">
          <h3 className="border-b bg-muted/40 px-4 py-2 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Projects</h3>
          <HealthList rows={projects} today={today} empty="No active projects." />
        </div>
      </div>
    </section>
  );
}
