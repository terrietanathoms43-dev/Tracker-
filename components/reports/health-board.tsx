import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { HealthBoard as HealthBoardData, HealthStatus } from "@/lib/reports/data";

const HEALTH_CONFIG: Record<
  HealthStatus,
  { label: string; icon: typeof CheckCircle2; className: string; barColor: string }
> = {
  on_track: {
    label: "On track",
    icon: CheckCircle2,
    className: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    barColor: "bg-emerald-500",
  },
  needs_attention: {
    label: "Needs attention",
    icon: Clock,
    className: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    barColor: "bg-amber-500",
  },
  at_risk: {
    label: "At risk",
    icon: AlertTriangle,
    className: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800",
    barColor: "bg-rose-500",
  },
};

export function HealthBoard({ data }: { data: HealthBoardData }) {
  const { goals, projects } = data;

  return (
    <div className="grid gap-6">
      {/* Goals Health */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold tracking-tight">Goals Health Board</h3>
          <p className="text-[12px] text-muted-foreground">Top-level goals: progress, blockers and overdue work beneath each</p>
        </div>
        {goals.length === 0 ? (
          <div className="p-4 text-[13px] text-muted-foreground">No active goals.</div>
        ) : (
          <div className="divide-y">
            {goals.map((goal) => {
              const cfg = HEALTH_CONFIG[goal.health];
              const Icon = cfg.icon;
              return (
                <div key={goal.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/goals/${goal.id}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {goal.title}
                      </Link>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}
                      >
                        <Icon className="size-3" aria-hidden />
                        {cfg.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                      <span>
                        {goal.completed} of {goal.total} tasks done
                      </span>
                      {goal.blocked > 0 ? (
                        <span className="font-medium text-rose-600 dark:text-rose-400">
                          {goal.blocked} blocked
                        </span>
                      ) : null}
                      {goal.overdue > 0 ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {goal.overdue} overdue
                        </span>
                      ) : null}
                      {goal.targetDate ? <span>Target: {goal.targetDate}</span> : null}
                    </div>
                  </div>

                  {/* Sparkbar */}
                  <div className="flex items-center gap-3 sm:w-48 sm:justify-end">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${cfg.barColor}`}
                        style={{ width: `${Math.min(goal.pct, 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-semibold tabular-nums">{goal.pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Projects Health */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold tracking-tight">Projects Health Board</h3>
          <p className="text-[12px] text-muted-foreground">Delivery and risk across the active projects</p>
        </div>
        {projects.length === 0 ? (
          <div className="p-4 text-[13px] text-muted-foreground">No active projects.</div>
        ) : (
          <div className="divide-y">
            {projects.map((project) => {
              const cfg = HEALTH_CONFIG[project.health];
              const Icon = cfg.icon;
              return (
                <div key={project.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}
                      >
                        <Icon className="size-3" aria-hidden />
                        {cfg.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                      <span>
                        {project.completed} of {project.total} tasks done
                      </span>
                      {project.blocked > 0 ? (
                        <span className="font-medium text-rose-600 dark:text-rose-400">
                          {project.blocked} blocked
                        </span>
                      ) : null}
                      {project.overdue > 0 ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {project.overdue} overdue
                        </span>
                      ) : null}
                      {project.targetDate ? <span>Target: {project.targetDate}</span> : null}
                    </div>
                  </div>

                  {/* Sparkbar */}
                  <div className="flex items-center gap-3 sm:w-48 sm:justify-end">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${cfg.barColor}`}
                        style={{ width: `${Math.min(project.pct, 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-semibold tabular-nums">{project.pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
