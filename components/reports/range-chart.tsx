"use client";

import { cn } from "cn";
import { CalendarClock, CheckCircle2, Flag, OctagonAlert, Pin } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { TimelineDay, TimelineTaskKind, TimelineTaskSummary } from "@/lib/reports/data";
import type { Pace } from "@/lib/reports/pace";
import { TIMELINE_LOOKAHEAD_DAYS } from "@/lib/reports/range";
import { formatDay } from "@/lib/time";

// The daily chart (docs/PLAN.md, 2026-11-01 log). One column per calendar day from the start of the range to two
// weeks past today; each bar is split into one segment per task (completed, then blockers raised, then, from today
// on, what falls due), with a surface gap between segments so they can be counted. Days ahead are shaded. The chart
// scrolls sideways when it is wider than the card and opens with today in the middle. Hovering a day keeps its
// tasks on show until another day is hovered; clicking pins it. Colours are the status tokens, so both themes are
// right, and blockers are hatched so the three kinds never rely on hue alone.

const PAD_LEFT = 24;
const PAD_RIGHT = 8;
const PAD_TOP = 30;
const PAD_BOTTOM = 28;
const HEIGHT = 200;
const PLOT = HEIGHT - PAD_TOP - PAD_BOTTOM;
/** Width of one day; the bar inside it is narrower (<= 24px) so the rest of the slot is air. */
const SLOT = 28;
const BAR = 18;
/** The surface gap between stacked segments. */
const GAP = 2;
const RADIUS = 4;
/** The y axis never shows fewer than this many tasks, so a quiet week doesn't look dramatic. */
const MIN_SCALE = 4;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const KIND_LABEL: Record<TimelineTaskKind, string> = { completed: "Completed", blocked: "Blocker raised", due: "Due" };
const KIND_BADGE: Record<TimelineTaskKind, string> = {
  completed: "bg-status-completed-bg text-status-completed-fg",
  blocked: "bg-status-blocked-bg text-status-blocked-fg",
  due: "bg-status-in-progress-bg text-status-in-progress-fg",
};

/** The top segment of a stack: rounded at the data end, square at the baseline (and at every seam below). */
function topSegmentPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(RADIUS, height / 2, width / 2);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

function KindIcon({ kind, className }: { kind: TimelineTaskKind; className?: string }) {
  if (kind === "completed") return <CheckCircle2 className={cn("size-3.5 shrink-0 text-status-completed-dot", className)} aria-hidden />;
  if (kind === "blocked") return <OctagonAlert className={cn("size-3.5 shrink-0 text-status-blocked-dot", className)} aria-hidden />;
  return <CalendarClock className={cn("size-3.5 shrink-0 text-status-in-progress-dot", className)} aria-hidden />;
}

/**
 * The thermometer (docs/PLAN.md, 2026-11-01 log): the share of the work done against the share a straight line from
 * the start to the target date expects by today. One look answers "is the whole thing on pace?"; the day columns
 * below say where the time went.
 */
function PaceStrip({ pace, today }: { pace: Pace; today: string }) {
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const expected = pace.expected ?? 0;
  const tone = pace.verdict === "behind" ? "behind" : pace.verdict === "ahead" || pace.verdict === "on_pace" ? "good" : "neutral";
  const sentence =
    pace.verdict === "nothing"
      ? "Nothing to pace yet: no tasks in this scope."
      : pace.verdict === "no_target"
        ? `${pct(pace.share)} done (${pace.done} of ${pace.total}) · no target date to pace against`
        : pace.verdict === "behind"
          ? `Behind pace: ${pct(pace.share)} done, ${pct(expected)} expected by today (${pace.gapPoints} points behind)`
          : pace.verdict === "ahead"
            ? `Ahead of pace: ${pct(pace.share)} done, ${pct(expected)} expected by today`
            : `On pace: ${pct(pace.share)} done, ${pct(expected)} expected by today`;
  const Icon = tone === "behind" ? OctagonAlert : tone === "good" ? CheckCircle2 : CalendarClock;
  const track = tone === "behind" ? "bg-status-blocked-bg" : tone === "good" ? "bg-status-completed-bg" : "bg-muted";
  const fill = tone === "behind" ? "bg-status-blocked-dot" : tone === "good" ? "bg-status-completed-dot" : "bg-primary";
  const markerLeft = `clamp(10px, ${expected * 100}%, calc(100% - 10px))`;
  return (
    <div className="mb-4 rounded-lg border bg-muted/30 px-3 pt-2.5 pb-2" data-testid="pace-strip" data-verdict={pace.verdict}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
        <p className={cn("flex items-center gap-1.5 font-medium", tone === "behind" ? "text-status-blocked-fg" : tone === "good" ? "text-status-completed-fg" : "text-foreground")}>
          <Icon className="size-4 shrink-0" aria-hidden />
          {sentence}
        </p>
        {pace.target ? (
          <span className="text-muted-foreground">
            {pace.start ? `Since ${formatDay(pace.start, today)} · ` : ""}Target {formatDay(pace.target, today)}
          </span>
        ) : null}
      </div>
      <div className={cn("relative mt-2 h-2.5 rounded-full", track)} role="img" aria-label={sentence}>
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${pace.share * 100}%` }} />
        {pace.expected !== null ? <span className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: markerLeft }} title="Expected by today" /> : null}
      </div>
      {pace.expected !== null ? (
        <div className="relative mt-1 h-4 text-[11px] text-muted-foreground">
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: markerLeft }}>
            today
          </span>
          <span className="absolute right-0">100%</span>
        </div>
      ) : null}
    </div>
  );
}

/** A swatch for the legend, drawn the way the bar draws that kind. */
function Swatch({ kind, hatchId }: { kind: TimelineTaskKind; hatchId: string }) {
  if (kind === "due") return <span className="inline-block size-3 rounded-[3px] border-[1.5px] border-status-in-progress-dot" aria-hidden />;
  if (kind === "completed") return <span className="inline-block size-3 rounded-[3px] bg-status-completed-dot" aria-hidden />;
  return (
    <svg width="12" height="12" className="shrink-0 rounded-[3px]" aria-hidden>
      <rect width="12" height="12" fill={`url(#${hatchId})`} />
    </svg>
  );
}

export function RangeChart({
  timeline,
  today,
  showMyWork = false,
  title,
  pace = null,
}: {
  timeline: TimelineDay[];
  today: string;
  /** The My work view: only the viewer's own tasks are drawn and counted. */
  showMyWork?: boolean;
  title: string;
  /** The scope's pace towards its target date, drawn as a thermometer above the days. */
  pace?: Pace | null;
}) {
  const hatchId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [hoverTask, setHoverTask] = useState<string | null>(null);

  const days = timeline.map((day) => ({ ...day, tasks: showMyWork ? day.tasks.filter((task) => task.isMine) : day.tasks }));
  const todayIndex = Math.max(
    0,
    days.findIndex((day) => day.date === today),
  );

  // Open with today in the middle of the visible part (nothing to do when the whole chart fits).
  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    const todayX = PAD_LEFT + todayIndex * SLOT + SLOT / 2;
    el.scrollLeft = Math.max(0, todayX - el.clientWidth / 2);
  }, [todayIndex, timeline]);

  const totals = {
    completed: days.reduce((sum, day) => sum + day.tasks.filter((task) => task.kind === "completed").length, 0),
    blocked: days.reduce((sum, day) => sum + day.tasks.filter((task) => task.kind === "blocked").length, 0),
    due: days.reduce((sum, day) => sum + day.tasks.filter((task) => task.kind === "due").length, 0),
    goals: days.reduce((sum, day) => sum + day.goalDeadlines.length, 0),
  };

  if (days.length === 0 || totals.completed + totals.blocked + totals.due + totals.goals === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-[13px] text-muted-foreground">
        {showMyWork ? "Nothing of yours was completed, blocked or falls due in this window." : "Nothing was completed, blocked or falls due in this window."}
      </div>
    );
  }

  const scale = Math.max(MIN_SCALE, ...days.map((day) => day.tasks.length));
  const unit = PLOT / scale;
  const width = PAD_LEFT + days.length * SLOT + PAD_RIGHT;
  const baseline = PAD_TOP + PLOT;
  const labelEvery = days.length <= 21 ? 1 : days.length <= 45 ? 2 : 7;
  const current = selected === null ? null : (days.find((day) => day.date === selected) ?? null);

  const choose = (date: string) => {
    if (pinned && selected === date) {
      setPinned(false);
      return;
    }
    setSelected(date);
    setPinned(true);
  };

  const summary = [
    `${totals.completed} ${showMyWork ? "completed by you" : "completed"}`,
    totals.blocked > 0 ? `${totals.blocked} ${totals.blocked === 1 ? "blocker" : "blockers"} raised` : null,
    totals.due > 0 ? `${totals.due} due ahead` : null,
    totals.goals > 0 ? `${totals.goals} goal ${totals.goals === 1 ? "deadline" : "deadlines"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // min-w-0: a grid item would otherwise grow to the SVG's full width and push the whole report past the screen.
    <section aria-labelledby="range-chart-title" className="min-w-0 max-w-full rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="range-chart-title" className="text-base font-semibold">
            {title}
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {summary} · to {TIMELINE_LOOKAHEAD_DAYS} days ahead
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <Swatch kind="completed" hatchId={hatchId} />
            {showMyWork ? "My completions" : "Completed"}
          </li>
          <li className="flex items-center gap-1.5">
            <Swatch kind="blocked" hatchId={hatchId} />
            Blocker raised
          </li>
          <li className="flex items-center gap-1.5">
            <Swatch kind="due" hatchId={hatchId} />
            Due
          </li>
          {totals.goals > 0 ? (
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-status-awaiting-dot ring-2 ring-status-awaiting-dot/30" aria-hidden />
              Goal deadline
            </li>
          ) : null}
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-[3px] bg-muted" aria-hidden />
            Ahead
          </li>
        </ul>
      </div>

      {pace ? <PaceStrip pace={pace} today={today} /> : null}

      <div ref={scroller} className="w-full overflow-x-auto" data-testid="range-chart-scroller">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="mx-auto block"
          role="group"
          aria-label={`One column per day. ${summary}. Hover or focus a day to list its tasks.`}
          onMouseLeave={() => setHoverTask(null)}
        >
          <defs>
            <pattern id={hatchId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="var(--status-blocked-bg)" />
              <line x1="0" y1="0" x2="0" y2="4" stroke="var(--status-blocked-dot)" strokeWidth="2" />
            </pattern>
          </defs>

          {/* Days ahead: one shaded band. */}
          {days.some((day) => day.future) ? (
            <rect
              x={PAD_LEFT + days.findIndex((day) => day.future) * SLOT}
              y={0}
              width={days.filter((day) => day.future).length * SLOT}
              height={HEIGHT}
              className="fill-muted"
              fillOpacity="0.5"
              data-future-band
            />
          ) : null}

          {/* Grid: solid hairlines at the baseline and half way, with their values in the left gutter. */}
          <line x1={PAD_LEFT} y1={baseline} x2={width - PAD_RIGHT} y2={baseline} className="stroke-border" strokeWidth="1" />
          <line x1={PAD_LEFT} y1={PAD_TOP + PLOT / 2} x2={width - PAD_RIGHT} y2={PAD_TOP + PLOT / 2} className="stroke-border" strokeWidth="1" />
          <text x={PAD_LEFT - 6} y={baseline + 3} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
            0
          </text>
          <text x={PAD_LEFT - 6} y={PAD_TOP + PLOT / 2 + 3} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
            {Math.round(scale / 2)}
          </text>

          {days.map((day, index) => {
            const x0 = PAD_LEFT + index * SLOT;
            const x = x0 + (SLOT - BAR) / 2;
            const isToday = day.date === today;
            const isSelected = selected === day.date;
            const [year, month, dayOfMonth] = day.date.split("-").map(Number);
            const monthStart = index === 0 || dayOfMonth === 1;
            const showLabel = isToday || monthStart || (index % labelEvery === 0 && !(labelEvery > 1 && Math.abs(index - todayIndex) < labelEvery));
            const label = monthStart ? `${MONTHS[month - 1]} ${dayOfMonth}` : String(dayOfMonth);
            const description = [
              formatDay(day.date, today),
              `${day.tasks.filter((task) => task.kind === "completed").length} completed`,
              `${day.tasks.filter((task) => task.kind === "blocked").length} blockers raised`,
              `${day.tasks.filter((task) => task.kind === "due").length} due`,
              day.goalDeadlines.length > 0 ? `${day.goalDeadlines.length} goal deadline${day.goalDeadlines.length === 1 ? "" : "s"}` : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <g key={day.date} data-day={day.date} data-future={day.future || undefined} data-in-range={day.inRange || undefined}>
                {/* The column: the hit target for the whole day (the segments are smaller than a fingertip). */}
                <rect
                  x={x0}
                  y={0}
                  width={SLOT}
                  height={HEIGHT}
                  tabIndex={0}
                  role="button"
                  aria-label={description}
                  aria-pressed={pinned && isSelected ? true : undefined}
                  className={cn("cursor-pointer outline-none", isSelected ? "fill-accent" : isToday ? "fill-primary/5" : "fill-transparent hover:fill-accent/40 focus-visible:fill-accent/40")}
                  onMouseEnter={() => {
                    if (!pinned) setSelected(day.date);
                  }}
                  onFocus={() => {
                    if (!pinned) setSelected(day.date);
                  }}
                  onClick={() => choose(day.date)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      choose(day.date);
                    }
                  }}
                >
                  <title>{description}</title>
                </rect>

                {/* Goal deadline: a pin above the column and a hairline down it. */}
                {day.goalDeadlines.length > 0 ? (
                  <g>
                    <line x1={x0 + SLOT / 2} y1={PAD_TOP - 8} x2={x0 + SLOT / 2} y2={baseline} className="stroke-status-awaiting-dot" strokeOpacity="0.5" strokeWidth="1" />
                    <circle cx={x0 + SLOT / 2} cy={PAD_TOP - 12} r="4" className="fill-status-awaiting-dot stroke-card" strokeWidth="2">
                      <title>{day.goalDeadlines.map((goal) => goal.title).join(", ")}</title>
                    </circle>
                  </g>
                ) : null}

                {/* One segment per task, stacked from the baseline, a surface gap between them. */}
                {day.tasks.map((task, position) => {
                  const top = baseline - (position + 1) * unit;
                  const height = Math.max(unit - GAP, 2);
                  const isTop = position === day.tasks.length - 1;
                  const hovered = hoverTask === `${day.date}:${task.id}:${task.kind}`;
                  const fill = task.kind === "completed" ? "var(--status-completed-dot)" : task.kind === "blocked" ? `url(#${hatchId})` : "var(--card)";
                  const stroke = task.kind === "due" ? "var(--status-in-progress-dot)" : hovered ? "var(--foreground)" : "none";
                  const common = {
                    fill,
                    stroke,
                    strokeWidth: task.kind === "due" ? 1.5 : 1,
                    opacity: hovered || hoverTask === null ? 1 : 0.75,
                    "data-segment": task.kind,
                    onMouseEnter: () => setHoverTask(`${day.date}:${task.id}:${task.kind}`),
                    onMouseLeave: () => setHoverTask(null),
                    className: "pointer-events-auto",
                  } as const;
                  return isTop ? (
                    <path key={`${task.id}-${task.kind}`} d={topSegmentPath(x, top + GAP, BAR, height)} {...common}>
                      <title>{`${task.title}: ${KIND_LABEL[task.kind]}`}</title>
                    </path>
                  ) : (
                    <rect key={`${task.id}-${task.kind}`} x={x} y={top + GAP} width={BAR} height={height} {...common}>
                      <title>{`${task.title}: ${KIND_LABEL[task.kind]}`}</title>
                    </rect>
                  );
                })}

                {/* A quiet dot on an empty past day keeps the axis readable. */}
                {day.tasks.length === 0 && !day.future ? <circle cx={x0 + SLOT / 2} cy={baseline} r="1.5" className="fill-muted-foreground" fillOpacity="0.35" /> : null}

                {showLabel ? (
                  <text
                    x={x0 + SLOT / 2}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    className={cn("pointer-events-none text-[10px] select-none", isToday ? "fill-primary font-semibold" : "fill-muted-foreground")}
                  >
                    {isToday ? "Today" : label}
                  </text>
                ) : null}
                {isToday ? <line x1={x0 + SLOT / 2} y1={baseline} x2={x0 + SLOT / 2} y2={baseline + 5} className="stroke-primary" strokeWidth="1.5" /> : null}
                <title>{`${year}`}</title>
              </g>
            );
          })}
        </svg>
      </div>

      {/* The day inspector: the chart's text twin. It stays once a day is chosen, until another is. */}
      {current ? (
        <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-[13px]" data-testid="day-inspector" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">{formatDay(current.date, today)}</span>
              {current.date === today ? <span className="rounded-xs bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Today</span> : null}
              {current.future ? <span className="rounded-xs bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Ahead</span> : null}
              {pinned && selected === current.date ? (
                <span className="inline-flex items-center gap-1 rounded-xs bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <Pin className="size-2.5" aria-hidden /> Pinned · click the day again to unpin
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground italic">Click a day to pin it</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium text-status-completed-fg">{current.tasks.filter((task) => task.kind === "completed").length} completed</span>
              {current.tasks.some((task) => task.kind === "blocked") ? (
                <span className="font-medium text-status-blocked-fg">{current.tasks.filter((task) => task.kind === "blocked").length} blocked</span>
              ) : null}
              {current.tasks.some((task) => task.kind === "due") ? (
                <span className="font-medium text-status-in-progress-fg">{current.tasks.filter((task) => task.kind === "due").length} due</span>
              ) : null}
            </div>
          </div>

          {current.goalDeadlines.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-status-awaiting-fg">
                <Flag className="size-3" aria-hidden /> Goal deadline:
              </span>
              {current.goalDeadlines.map((goal) => (
                <Link key={goal.id} href={`/goals/${goal.id}`} className="rounded-md border border-status-awaiting-dot/40 bg-status-awaiting-bg px-2 py-0.5 text-xs font-medium text-status-awaiting-fg hover:underline">
                  {goal.title}
                </Link>
              ))}
            </div>
          ) : null}

          <ul className="mt-2.5 grid gap-1">
            {current.tasks.length === 0 ? (
              <li className="text-[12px] text-muted-foreground">{current.future ? "Nothing falls due on this day." : "No task was completed or blocked on this day."}</li>
            ) : (
              current.tasks.map((task: TimelineTaskSummary) => {
                const key = `${current.date}:${task.id}:${task.kind}`;
                return (
                  <li
                    key={key}
                    className={cn("flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs transition-colors", hoverTask === key && "bg-accent")}
                    onMouseEnter={() => setHoverTask(key)}
                    onMouseLeave={() => setHoverTask(null)}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <KindIcon kind={task.kind} />
                      <Link href={`/tasks/${task.id}`} className="truncate font-medium text-foreground hover:underline">
                        {task.title}
                      </Link>
                      {task.project ? <span className="hidden truncate text-muted-foreground sm:inline">· {task.project}</span> : null}
                    </div>
                    <span className={cn("shrink-0 rounded-xs px-1.5 py-0.5 text-[10px] font-medium", KIND_BADGE[task.kind])}>{KIND_LABEL[task.kind]}</span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-center text-[11px] text-muted-foreground italic">Hover over or click a day to see its tasks; the shaded days are ahead.</p>
      )}
    </section>
  );
}
