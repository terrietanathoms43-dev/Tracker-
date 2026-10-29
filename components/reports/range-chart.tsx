"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Flag, Pin } from "lucide-react";
import type { TimelineDay } from "@/lib/reports/data";
import { formatDay } from "@/lib/time";

export function RangeChart({
  timeline,
  today,
  showMyWork = false,
  title = "Daily task completions & goal deadlines",
}: {
  timeline: TimelineDay[];
  today: string;
  showMyWork?: boolean;
  title?: string;
}) {
  const completedGradId = useId();
  const blockedGradId = useId();
  const [activeDay, setActiveDay] = useState<TimelineDay | null>(null);
  const [pinnedDay, setPinnedDay] = useState<TimelineDay | null>(null);

  if (timeline.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-[13px] text-muted-foreground">
        No activity recorded in this range.
      </div>
    );
  }

  const height = 190;
  const paddingBottom = 32;
  const paddingTop = 32;
  const chartHeight = height - paddingBottom - paddingTop;

  // Max value calculation for scaling: sum of completed and blocked to accurately scale stacked bars
  const maxVal = Math.max(
    ...timeline.map((d) => (showMyWork ? d.myCompleted : d.completed) + d.blockedRaised),
    4,
  );
  const totalCompleted = timeline.reduce((acc, d) => acc + (showMyWork ? d.myCompleted : d.completed), 0);
  const totalBlocked = timeline.reduce((acc, d) => acc + d.blockedRaised, 0);
  const totalGoals = timeline.reduce((acc, d) => acc + d.goalDeadlines.length, 0);

  // Determine current week days for the marker strip
  const todayDate = new Date(`${today}T00:00:00Z`);
  const dayOfWeek = todayDate.getUTCDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const mondayTime = todayDate.getTime() - diffToMonday * 86400000;
  const sundayTime = mondayTime + 6 * 86400000;

  const isDueThisWeek = (dateStr: string) => {
    const t = new Date(`${dateStr}T00:00:00Z`).getTime();
    return t >= mondayTime && t <= sundayTime;
  };

  const selected = pinnedDay ?? activeDay;

  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Header & Legend */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <p className="text-[12px] text-muted-foreground">
            {totalCompleted} {showMyWork ? "completed by you" : "tasks completed"}
            {totalBlocked > 0 ? ` · ${totalBlocked} blockers raised` : ""}
            {totalGoals > 0 ? ` · ${totalGoals} goal ${totalGoals === 1 ? "deadline" : "deadlines"}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-500" />
            <span>{showMyWork ? "My completions" : "Delivered"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-rose-500" />
            <span>Friction (Blockers)</span>
          </div>
          {totalGoals > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500 ring-2 ring-amber-500/30" />
              <span>Goal milestone</span>
            </div>
          ) : null}
          {showMyWork ? (
            <div className="flex items-center gap-1.5">
              <span className="h-1 w-3 rounded-full bg-blue-500/60" />
              <span>This week</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${Math.max(timeline.length * 36, 520)} ${height}`}
          className="h-48 w-full min-w-[520px]"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={completedGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id={blockedGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0.85" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1="0"
            y1={paddingTop + chartHeight}
            x2="100%"
            y2={paddingTop + chartHeight}
            className="stroke-border"
            strokeWidth="1"
          />
          <line
            x1="0"
            y1={paddingTop + chartHeight / 2}
            x2="100%"
            y2={paddingTop + chartHeight / 2}
            className="stroke-border/40"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {timeline.map((day, i) => {
            const completedCount = showMyWork ? day.myCompleted : day.completed;
            const blockedCount = day.blockedRaised;
            const totalCount = completedCount + blockedCount;

            const totalBarHeight = totalCount > 0 ? Math.max((totalCount / maxVal) * chartHeight, 6) : 0;
            const completedBarHeight = totalCount > 0 ? (completedCount / totalCount) * totalBarHeight : 0;
            const blockedBarHeight = totalCount > 0 ? (blockedCount / totalCount) * totalBarHeight : 0;

            const totalBars = timeline.length;
            const svgWidth = Math.max(timeline.length * 36, 520);
            const slotWidth = svgWidth / totalBars;
            const barWidth = Math.min(Math.max(slotWidth - 8, 10), 22);
            const x = i * slotWidth + (slotWidth - barWidth) / 2;

            const yCompleted = paddingTop + chartHeight - completedBarHeight;
            const yBlocked = yCompleted - blockedBarHeight;

            const isToday = day.date === today;
            const isSelected = selected?.date === day.date;
            const hasGoal = day.goalDeadlines.length > 0;
            const inWeek = isDueThisWeek(day.date);

            return (
              <g
                key={day.date}
                className="cursor-pointer"
                onMouseEnter={() => !pinnedDay && setActiveDay(day)}
                onMouseLeave={() => !pinnedDay && setActiveDay(null)}
                onClick={() => setPinnedDay(pinnedDay?.date === day.date ? null : day)}
              >
                {/* Background column highlight */}
                <rect
                  x={i * slotWidth}
                  y={0}
                  width={slotWidth}
                  height={height}
                  className={`transition-colors ${
                    isSelected ? "fill-accent/60" : "fill-transparent hover:fill-accent/30"
                  }`}
                />

                {/* Completed Stack (Bottom) */}
                {completedBarHeight > 0 ? (
                  <rect
                    x={x}
                    y={yCompleted}
                    width={barWidth}
                    height={completedBarHeight}
                    rx={blockedBarHeight > 0 ? 0 : 3}
                    fill={`url(#${completedGradId})`}
                  />
                ) : null}

                {/* Blocked Stack (Top) */}
                {blockedBarHeight > 0 ? (
                  <rect
                    x={x}
                    y={yBlocked}
                    width={barWidth}
                    height={blockedBarHeight}
                    rx={3}
                    fill={`url(#${blockedGradId})`}
                  />
                ) : null}

                {/* Empty day dot */}
                {totalCount === 0 ? (
                  <circle
                    cx={x + barWidth / 2}
                    cy={paddingTop + chartHeight}
                    r="1.5"
                    className="fill-muted-foreground/30"
                  />
                ) : null}

                {/* Goal Milestone Marker Pin */}
                {hasGoal ? (
                  <g>
                    <line
                      x1={x + barWidth / 2}
                      y1={paddingTop - 14}
                      x2={x + barWidth / 2}
                      y2={paddingTop + chartHeight}
                      className="stroke-amber-500/60"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={x + barWidth / 2}
                      cy={paddingTop - 16}
                      r="4.5"
                      className="fill-amber-500 stroke-background stroke-2"
                    />
                  </g>
                ) : null}

                {/* Due this week marker strip */}
                {showMyWork && inWeek ? (
                  <rect
                    x={i * slotWidth + 2}
                    y={height - 18}
                    width={slotWidth - 4}
                    height={3}
                    rx={1.5}
                    className="fill-blue-500/70"
                  />
                ) : null}

                {/* X-axis date label */}
                {(totalBars <= 14 || i % Math.ceil(totalBars / 12) === 0 || isToday) && (
                  <text
                    x={x + barWidth / 2}
                    y={height - 6}
                    textAnchor="middle"
                    className={`text-[10px] select-none ${
                      isToday ? "fill-primary font-bold" : "fill-muted-foreground"
                    }`}
                  >
                    {day.date.slice(8)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Rich Day Inspector (Shows tasks on that specific day) */}
      {selected ? (
        <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-[13px] animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{formatDay(selected.date, today)}</span>
              {selected.date === today ? (
                <span className="rounded-xs bg-primary/10 px-1.5 py-0.2 text-[10px] font-medium text-primary">
                  Today
                </span>
              ) : null}
              {pinnedDay?.date === selected.date ? (
                <span className="inline-flex items-center gap-1 rounded-xs bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
                  <Pin className="size-2.5" aria-hidden /> Pinned (click day to unpin)
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground italic">(click day to pin)</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {showMyWork ? selected.myCompleted : selected.completed} delivered
              </span>
              {selected.blockedRaised > 0 ? (
                <span className="font-medium text-rose-600 dark:text-rose-400">
                  {selected.blockedRaised} blocked
                </span>
              ) : null}
            </div>
          </div>

          {/* Goal Milestones for this day */}
          {selected.goalDeadlines.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                <Flag className="size-3" aria-hidden /> Goal Milestones:
              </span>
              {selected.goalDeadlines.map((g) => (
                <Link
                  key={g.id}
                  href={`/goals/${g.id}`}
                  className="rounded-md border border-amber-300 bg-amber-50/60 px-2 py-0.5 text-xs font-medium text-amber-900 hover:underline dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  {g.title}
                </Link>
              ))}
            </div>
          ) : null}

          {/* Tasks List on this Day */}
          <div className="mt-2.5 space-y-1.5">
            {selected.tasks.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No tasks completed or blocked on this date.</p>
            ) : (
              selected.tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {task.kind === "completed" ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    ) : (
                      <AlertCircle className="size-3.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
                    )}
                    <Link
                      href={`/tasks/${task.id}`}
                      className="truncate font-medium text-foreground hover:underline"
                    >
                      {task.title}
                    </Link>
                  </div>
                  <span
                    className={`shrink-0 rounded-xs px-1.5 py-0.2 text-[10px] font-medium ${
                      task.kind === "completed"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                    }`}
                  >
                    {task.kind === "completed" ? "Completed" : "Blocked raised"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-center text-[11px] text-muted-foreground italic">
          Hover over or click any day to inspect the specific tasks delivered or blocked.
        </p>
      )}
    </div>
  );
}
