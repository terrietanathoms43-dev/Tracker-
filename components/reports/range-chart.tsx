"use client";

import { cn } from "cn";
import { CalendarClock, CalendarX2, CheckCircle2, ChevronLeft, ChevronRight, Flag, Maximize2, OctagonAlert, Pin, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TimelineDay, TimelineTaskKind, TimelineTaskSummary } from "@/lib/reports/data";
import { HEALTH_LABELS, HEALTH_ORDER, type HealthStatus } from "@/lib/reports/health";
import type { Pace } from "@/lib/reports/pace";
import { TIMELINE_LOOKAHEAD_DAYS } from "@/lib/reports/range";
import { formatDay } from "@/lib/time";

// The daily chart (docs/PLAN.md, 2026-11-01 and 2026-11-03 logs). One column per calendar day from the start of the
// range to two weeks past today. The y axis is the day's activity: every history row of every task in scope
// (a completion, a comment, an edit, a status change, each +1), drawn as the grey line and its wash, so a glance
// says whether the team is busier or quieter. The bars are counts, not heights: one fixed-size block per task
// (completed, then blockers raised, then overdue, then, from today on, what falls due), stacked with a surface gap,
// so a day with three completions shows three blocks whatever the activity scale. The chart fills its card with
// no scrollbar: zoom shows fewer or more days (anchored on today) and ‹ › move along the window. Today is marked
// with a strong line. Hovering a day keeps its tasks on show until another day is hovered; clicking pins it.

const PAD_LEFT = 30;
const PAD_RIGHT = 8;
const PAD_TOP = 30;
const PAD_BOTTOM = 28;
const HEIGHT = 220;
const PLOT = HEIGHT - PAD_TOP - PAD_BOTTOM;
/** A bar never fills its slot (<= 24px, the rest is air) and never vanishes. */
const MAX_BAR = 22;
const MIN_BAR = 3;
/** One task is one block of this height; a day whose stack would not fit the plot shrinks its blocks to fit. */
const BLOCK = 12;
/** The surface gap between stacked blocks. */
const GAP = 2;
const RADIUS = 4;
/** The y axis never shows fewer than this many events, so a quiet week doesn't look dramatic. */
const MIN_SCALE = 4;
/** The fewest days a zoom shows; and how many pixels a day gets before the default view starts cutting days. */
const MIN_DAYS = 7;
const COMFORTABLE_SLOT = 20;
const ZOOM_STEP = 1.5;
/** The width assumed before the card has been measured (the first paint only). */
const ASSUMED_WIDTH = 960;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const KIND_LABEL: Record<TimelineTaskKind, string> = {
  completed: "Completed",
  blocked: "Blocker raised",
  overdue: "Overdue",
  due: "Due",
};
const KIND_BADGE: Record<TimelineTaskKind, string> = {
  completed: "bg-status-completed-bg text-status-completed-fg",
  blocked: "bg-status-blocked-bg text-status-blocked-fg",
  overdue: "bg-status-blocked-dot text-white",
  due: "bg-status-in-progress-bg text-status-in-progress-fg",
};

/** A goal deadline pin wears the goal's health, so an at-risk or delayed deadline is red before anyone hovers. */
const PIN_TONE: Record<HealthStatus, { fill: string; stroke: string }> = {
  delayed: { fill: "fill-status-blocked-dot", stroke: "stroke-status-blocked-dot" },
  at_risk: { fill: "fill-status-blocked-dot", stroke: "stroke-status-blocked-dot" },
  needs_attention: { fill: "fill-status-awaiting-dot", stroke: "stroke-status-awaiting-dot" },
  on_track: { fill: "fill-status-completed-dot", stroke: "stroke-status-completed-dot" },
};

/** The worst health among the goals due on one day: that is the colour the day's pin takes. */
const worstHealth = (markers: { health: HealthStatus }[]): HealthStatus => HEALTH_ORDER.find((health) => markers.some((marker) => marker.health === health)) ?? "on_track";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The top segment of a stack: rounded at the data end, square at the baseline (and at every seam below). */
function topSegmentPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(RADIUS, height / 2, width / 2);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

function KindIcon({ kind, className }: { kind: TimelineTaskKind; className?: string }) {
  if (kind === "completed") return <CheckCircle2 className={cn("size-3.5 shrink-0 text-status-completed-dot", className)} aria-hidden />;
  if (kind === "blocked") return <OctagonAlert className={cn("size-3.5 shrink-0 text-status-blocked-dot", className)} aria-hidden />;
  if (kind === "overdue") return <CalendarX2 className={cn("size-3.5 shrink-0 text-status-blocked-fg", className)} aria-hidden />;
  return <CalendarClock className={cn("size-3.5 shrink-0 text-status-in-progress-dot", className)} aria-hidden />;
}

/** A swatch for the legend, drawn the way the bar draws that kind. */
function Swatch({ kind, hatchId }: { kind: TimelineTaskKind; hatchId: string }) {
  if (kind === "due") return <span className="inline-block size-3 rounded-[3px] border-[1.5px] border-status-in-progress-dot" aria-hidden />;
  if (kind === "overdue") return <span className="inline-block size-3 rounded-[3px] bg-status-blocked-dot ring-1 ring-status-blocked-fg" aria-hidden />;
  if (kind === "completed") return <span className="inline-block size-3 rounded-[3px] bg-status-completed-dot" aria-hidden />;
  return (
    <svg width="12" height="12" className="shrink-0 rounded-[3px]" aria-hidden>
      <rect width="12" height="12" fill={`url(#${hatchId})`} />
    </svg>
  );
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

export function RangeChart({
  timeline,
  today,
  showMyWork = false,
  title,
  description,
  pace = null,
  overdueEarlier = 0,
}: {
  timeline: TimelineDay[];
  today: string;
  /** The My work view: only the viewer's own tasks are drawn and counted. */
  showMyWork?: boolean;
  title: string;
  /** One sentence under the title: what this view's widget draws. */
  description?: string;
  /** The scope's pace towards its target date, drawn as a thermometer above the days. */
  pace?: Pace | null;
  /** Open tasks overdue since before the chart's first day: they have no column, so they are said in words. */
  overdueEarlier?: number;
}) {
  const hatchId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(ASSUMED_WIDTH);
  /** How many days are on show (null = the default for this width) and which day the view starts at (null = ending at the window's end). */
  const [zoom, setZoom] = useState<number | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [hoverTask, setHoverTask] = useState<string | null>(null);

  // The chart is as wide as its card, whatever the screen; it re-measures when the card does.
  useEffect(() => {
    const el = frame.current;
    if (el === null) return;
    // The observer reports once on observe(), so the first measurement arrives without a synchronous set.
    const measure = () => setWidth(Math.max(280, Math.floor(el.clientWidth)));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const days = timeline.map((day) => ({
    ...day,
    tasks: showMyWork ? day.tasks.filter((task) => task.isMine) : day.tasks,
  }));
  const total = days.length;
  const todayIndex = Math.max(
    0,
    days.findIndex((day) => day.date === today),
  );

  const totals = {
    completed: days.reduce((sum, day) => sum + day.tasks.filter((task) => task.kind === "completed").length, 0),
    blocked: days.reduce((sum, day) => sum + day.tasks.filter((task) => task.kind === "blocked").length, 0),
    overdue: days.reduce((sum, day) => sum + day.tasks.filter((task) => task.kind === "overdue").length, 0),
    due: days.reduce((sum, day) => sum + day.tasks.filter((task) => task.kind === "due").length, 0),
    goals: days.reduce((sum, day) => sum + day.goalDeadlines.length, 0),
    activity: days.reduce((sum, day) => sum + day.activity, 0),
  };
  const overdueTotal = totals.overdue + overdueEarlier;
  const overdueNote = overdueTotal > 0 ? `${overdueTotal} overdue${overdueEarlier > 0 ? ` (${overdueEarlier} due before this window)` : ""}` : null;

  if (total === 0 || totals.completed + totals.blocked + totals.due + totals.goals + totals.activity + overdueTotal === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-[13px] text-muted-foreground">
        {showMyWork ? "Nothing of yours was completed, blocked or falls due in this window." : "Nothing happened, was completed, blocked or falls due in this window."}
      </div>
    );
  }

  // --- the view: which days are on show, and how wide each is -----------------------------------------------------
  const plotWidth = width - PAD_LEFT - PAD_RIGHT;
  const defaultShown = clamp(Math.floor(plotWidth / COMFORTABLE_SLOT), MIN_DAYS, total);
  const shown = clamp(zoom ?? defaultShown, MIN_DAYS, total);
  // By default today sits towards the right with at most a third of the view ahead of it, so it is always in view
  // (a phone shows a fortnight or so around today; a desktop usually fits the whole window).
  const aheadInView = Math.min(TIMELINE_LOOKAHEAD_DAYS, Math.floor(shown / 3));
  const defaultStart = clamp(todayIndex + aheadInView - shown + 1, 0, total - shown);
  const viewStart = clamp(start ?? defaultStart, 0, total - shown);
  const view = days.slice(viewStart, viewStart + shown);
  const slot = plotWidth / shown;
  const bar = clamp(slot - 4, MIN_BAR, MAX_BAR);
  const canZoomIn = shown > MIN_DAYS;
  const canZoomOut = shown < total;
  const fitted = shown === total;

  /** Zooms to `next` days keeping today where it was on screen (or the view's centre when today is off it). */
  const zoomTo = (next: number) => {
    const target = clamp(next, MIN_DAYS, total);
    const anchor = todayIndex >= viewStart && todayIndex < viewStart + shown ? todayIndex : viewStart + Math.floor(shown / 2);
    const share = (anchor - viewStart) / shown;
    setZoom(target);
    setStart(clamp(Math.round(anchor - share * target), 0, total - target));
  };
  const pan = (days: number) => setStart(clamp(viewStart + days, 0, total - shown));
  const fit = () => {
    setZoom(total);
    setStart(0);
  };

  // The y axis is the day's activity count. The blocks are counts of tasks: a fixed height each, shrunk only when a
  // day's stack would not fit the plot.
  const scale = Math.max(MIN_SCALE, ...view.filter((day) => !day.future).map((day) => day.activity));
  const tallest = Math.max(1, ...view.map((day) => day.tasks.length));
  const unit = Math.min(BLOCK, PLOT / tallest);
  const baseline = PAD_TOP + PLOT;
  const labelEvery = slot >= 26 ? 1 : slot >= 13 ? 2 : slot >= 7 ? 7 : 14;
  const current = selected === null ? null : (days.find((day) => day.date === selected) ?? null);

  // The activity line: one point per past day, on the y axis.
  const pulse = view
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => !day.future)
    .map(({ day, index }) => ({
      x: PAD_LEFT + index * slot + slot / 2,
      y: baseline - (day.activity / scale) * PLOT,
    }));
  const pulseLine = pulse.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const pulseArea = pulse.length > 1 ? `${pulseLine} L${pulse[pulse.length - 1].x.toFixed(1)},${baseline} L${pulse[0].x.toFixed(1)},${baseline} Z` : "";
  const ticks = [0, Math.round(scale / 2), scale];

  const choose = (date: string) => {
    if (pinned && selected === date) {
      setPinned(false);
      return;
    }
    setSelected(date);
    setPinned(true);
  };

  const summary = [
    `${totals.activity} ${totals.activity === 1 ? "event" : "events"}`,
    `${totals.completed} ${showMyWork ? "completed by you" : "completed"}`,
    totals.blocked > 0 ? `${totals.blocked} ${totals.blocked === 1 ? "blocker" : "blockers"} raised` : null,
    totals.due > 0 ? `${totals.due} due ahead` : null,
    totals.goals > 0 ? `${totals.goals} goal ${totals.goals === 1 ? "deadline" : "deadlines"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const first = view[0];
  const last = view[view.length - 1];
  const todayX = PAD_LEFT + (todayIndex - viewStart) * slot + slot / 2;
  const todayInView = todayIndex >= viewStart && todayIndex < viewStart + shown;

  return (
    // min-w-0: a grid item would otherwise grow to its content and push the whole report past the screen.
    <section aria-labelledby="range-chart-title" className="min-w-0 max-w-full rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="range-chart-title" className="text-base font-semibold">
            {title}
          </h2>
          {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
          <p className="text-[12px] text-muted-foreground">
            {overdueNote ? <span className="font-semibold text-status-blocked-fg">{overdueNote} · </span> : null}
            {summary} · to {TIMELINE_LOOKAHEAD_DAYS} days ahead
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-full bg-muted-foreground" aria-hidden />
            Activity per day (the axis)
          </li>
          <li className="flex items-center gap-1.5">
            <Swatch kind="completed" hatchId={hatchId} />
            {showMyWork ? "My completions" : "Completed"} (one block each)
          </li>
          <li className="flex items-center gap-1.5">
            <Swatch kind="blocked" hatchId={hatchId} />
            Blocker raised
          </li>
          <li className="flex items-center gap-1.5">
            <Swatch kind="overdue" hatchId={hatchId} />
            Overdue
          </li>
          <li className="flex items-center gap-1.5">
            <Swatch kind="due" hatchId={hatchId} />
            Due
          </li>
          {totals.goals > 0 ? (
            <li className="flex items-center gap-1.5">
              <span className="flex -space-x-1" aria-hidden>
                <span className="size-2.5 rounded-full bg-status-blocked-dot ring-1 ring-card" />
                <span className="size-2.5 rounded-full bg-status-completed-dot ring-1 ring-card" />
              </span>
              Goal deadline (red when at risk or delayed)
            </li>
          ) : null}
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-0.5 rounded-full bg-primary" aria-hidden />
            Today
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-[3px] bg-muted" aria-hidden />
            Ahead
          </li>
        </ul>
      </div>

      {pace ? <PaceStrip pace={pace} today={today} /> : null}

      {/* Zoom: fewer or more days across the same width, anchored on today; ‹ › move along the window. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2" data-print-hide>
        <span className="text-[12px] text-muted-foreground" data-testid="range-chart-view">
          {first && last ? `${formatDay(first.date, today)} – ${formatDay(last.date, today)} · ${shown} of ${total} days` : null}
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom and move">
          <Button type="button" variant="outline" size="icon-xs" aria-label="Earlier days" disabled={viewStart === 0} onClick={() => pan(-Math.max(1, Math.round(shown / 2)))}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon-xs" aria-label="Zoom out: more days" disabled={!canZoomOut} onClick={() => zoomTo(Math.round(shown * ZOOM_STEP))}>
            <ZoomOut aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon-xs" aria-label="Zoom in: fewer days" disabled={!canZoomIn} onClick={() => zoomTo(Math.round(shown / ZOOM_STEP))}>
            <ZoomIn aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="xs" aria-label="Fit every day of the window" disabled={fitted && viewStart === 0} onClick={fit}>
            <Maximize2 aria-hidden />
            Fit all
          </Button>
          <Button type="button" variant="outline" size="icon-xs" aria-label="Later days" disabled={viewStart + shown >= total} onClick={() => pan(Math.max(1, Math.round(shown / 2)))}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <div ref={frame} className="w-full" data-testid="range-chart-frame">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block max-w-full"
          role="group"
          aria-label={`One column per day, ${shown} days on show. The axis is events per day. ${overdueNote ? `${overdueNote}. ` : ""}${summary}. Hover or focus a day to list its tasks.`}
          onMouseLeave={() => setHoverTask(null)}
        >
          <defs>
            <pattern id={hatchId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="var(--status-blocked-bg)" />
              <line x1="0" y1="0" x2="0" y2="4" stroke="var(--status-blocked-dot)" strokeWidth="2" />
            </pattern>
          </defs>

          {/* Days ahead: one shaded band. */}
          {view.some((day) => day.future) ? (
            <rect x={PAD_LEFT + view.findIndex((day) => day.future) * slot} y={0} width={view.filter((day) => day.future).length * slot} height={HEIGHT} className="fill-muted" fillOpacity="0.5" data-future-band />
          ) : null}

          {/* Grid: hairlines at the baseline, half way and the top, with the activity count in the left gutter. */}
          {ticks.map((tick, index) => {
            const y = baseline - (index / 2) * PLOT;
            return (
              <g key={tick + ":" + index}>
                <line x1={PAD_LEFT} y1={y} x2={width - PAD_RIGHT} y2={y} className="stroke-border" strokeWidth="1" strokeDasharray={index === 0 ? undefined : "3 3"} />
                <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums" data-axis-tick>
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Activity per day: the axis's own line, with a wash under it. */}
          {pulse.length > 1 ? (
            <g className="pointer-events-none" data-testid="activity-line">
              <path d={pulseArea} className="fill-muted-foreground" fillOpacity="0.1" />
              <path d={pulseLine} fill="none" className="stroke-muted-foreground" strokeOpacity="0.85" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ) : null}

          {/* Today: a strong line the full height of the plot. */}
          {todayInView ? <line x1={todayX} y1={PAD_TOP - 8} x2={todayX} y2={baseline + 5} className="stroke-primary" strokeWidth="2.5" strokeOpacity="0.9" strokeLinecap="round" data-today-line /> : null}

          {view.map((day, index) => {
            const x0 = PAD_LEFT + index * slot;
            const x = x0 + (slot - bar) / 2;
            const isToday = day.date === today;
            const isSelected = selected === day.date;
            const [, month, dayOfMonth] = day.date.split("-").map(Number);
            const monthStart = index === 0 || dayOfMonth === 1;
            const showLabel = isToday || monthStart || (index % labelEvery === 0 && !(labelEvery > 1 && Math.abs(index - (todayIndex - viewStart)) < labelEvery));
            const label = monthStart ? `${MONTHS[month - 1]} ${dayOfMonth}` : String(dayOfMonth);
            const description = [
              formatDay(day.date, today),
              !day.future ? `${day.activity} ${day.activity === 1 ? "event" : "events"}` : null,
              `${day.tasks.filter((task) => task.kind === "completed").length} completed`,
              `${day.tasks.filter((task) => task.kind === "blocked").length} blockers raised`,
              `${day.tasks.filter((task) => task.kind === "overdue").length} overdue`,
              `${day.tasks.filter((task) => task.kind === "due").length} due`,
              day.goalDeadlines.length > 0 ? `${day.goalDeadlines.length} goal deadline${day.goalDeadlines.length === 1 ? "" : "s"}` : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <g key={day.date} data-day={day.date} data-future={day.future || undefined} data-in-range={day.inRange || undefined}>
                {/* The column: the hit target for the whole day (the blocks are smaller than a fingertip). */}
                <rect
                  x={x0}
                  y={0}
                  width={slot}
                  height={HEIGHT}
                  tabIndex={0}
                  role="button"
                  aria-label={description}
                  aria-pressed={pinned && isSelected ? true : undefined}
                  className={cn("cursor-pointer outline-none", isSelected ? "fill-accent" : isToday ? "fill-primary/10" : "fill-transparent hover:fill-accent/40 focus-visible:fill-accent/40")}
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

                {/* An overdue day screams: a red wash down the column and a mark above its bar. */}
                {day.tasks.some((task) => task.kind === "overdue") ? (
                  <>
                    <rect x={x0} y={PAD_TOP - 4} width={slot} height={PLOT + 4} className="pointer-events-none fill-status-blocked-dot" fillOpacity="0.14" data-overdue-day />
                    <text x={x0 + slot / 2} y={baseline - day.tasks.length * unit - 6} textAnchor="middle" className="pointer-events-none fill-status-blocked-fg text-[13px] font-bold select-none">
                      !
                    </text>
                  </>
                ) : null}

                {/* Goal deadline: a pin above the column and a hairline down it, in the colour of the goal's health. */}
                {day.goalDeadlines.length > 0 ? (
                  <g>
                    <line x1={x0 + slot / 2} y1={PAD_TOP - 8} x2={x0 + slot / 2} y2={baseline} className={PIN_TONE[worstHealth(day.goalDeadlines)].stroke} strokeOpacity="0.55" strokeWidth="1" />
                    <circle cx={x0 + slot / 2} cy={PAD_TOP - 12} r={worstHealth(day.goalDeadlines) === "on_track" ? 4 : 5} className={cn(PIN_TONE[worstHealth(day.goalDeadlines)].fill, "stroke-card")} strokeWidth="2">
                      <title>{day.goalDeadlines.map((goal) => `${goal.title} (${HEALTH_LABELS[goal.health]})`).join(", ")}</title>
                    </circle>
                  </g>
                ) : null}

                {/* One block per task, stacked from the baseline, a surface gap between them. */}
                {day.tasks.map((task, position) => {
                  const top = baseline - (position + 1) * unit;
                  const height = Math.max(unit - GAP, 2);
                  const isTop = position === day.tasks.length - 1;
                  const key = `${day.date}:${task.id}:${task.kind}`;
                  const hovered = hoverTask === key;
                  const fill = task.kind === "completed" ? "var(--status-completed-dot)" : task.kind === "blocked" ? `url(#${hatchId})` : task.kind === "overdue" ? "var(--status-blocked-dot)" : "var(--card)";
                  const stroke = task.kind === "due" ? "var(--status-in-progress-dot)" : task.kind === "overdue" ? "var(--status-blocked-fg)" : hovered ? "var(--foreground)" : "none";
                  const common = {
                    fill,
                    stroke,
                    strokeWidth: task.kind === "due" || task.kind === "overdue" ? 1.5 : 1,
                    opacity: hovered || hoverTask === null ? 1 : 0.75,
                    "data-segment": task.kind,
                    onMouseEnter: () => setHoverTask(key),
                    onMouseLeave: () => setHoverTask(null),
                    className: "pointer-events-auto",
                  } as const;
                  return isTop ? (
                    <path key={key} d={topSegmentPath(x, top + GAP, bar, height)} {...common}>
                      <title>{`${task.title}: ${KIND_LABEL[task.kind]}`}</title>
                    </path>
                  ) : (
                    <rect key={key} x={x} y={top + GAP} width={bar} height={height} {...common}>
                      <title>{`${task.title}: ${KIND_LABEL[task.kind]}`}</title>
                    </rect>
                  );
                })}

                {/* A quiet dot on an empty past day keeps the axis readable. */}
                {day.tasks.length === 0 && !day.future && slot >= 10 ? <circle cx={x0 + slot / 2} cy={baseline} r="1.5" className="fill-muted-foreground" fillOpacity="0.35" /> : null}

                {showLabel ? (
                  <text x={x0 + slot / 2} y={HEIGHT - 8} textAnchor="middle" className={cn("pointer-events-none select-none", isToday ? "fill-primary text-[11px] font-bold" : "fill-muted-foreground text-[10px]")}>
                    {isToday ? "Today" : label}
                  </text>
                ) : null}
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
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {!current.future ? (
                <span className="font-medium text-foreground">
                  {current.activity} {current.activity === 1 ? "event" : "events"}
                </span>
              ) : null}
              {current.tasks.some((task) => task.kind === "overdue") ? (
                <span className="rounded-sm bg-status-blocked-dot px-1.5 py-0.5 font-semibold text-white">{current.tasks.filter((task) => task.kind === "overdue").length} overdue</span>
              ) : null}
              <span className="font-medium text-status-completed-fg">{current.tasks.filter((task) => task.kind === "completed").length} completed</span>
              {current.tasks.some((task) => task.kind === "blocked") ? <span className="font-medium text-status-blocked-fg">{current.tasks.filter((task) => task.kind === "blocked").length} blocked</span> : null}
              {current.tasks.some((task) => task.kind === "due") ? <span className="font-medium text-status-in-progress-fg">{current.tasks.filter((task) => task.kind === "due").length} due</span> : null}
            </div>
          </div>

          {current.goalDeadlines.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-status-awaiting-fg">
                <Flag className="size-3" aria-hidden /> Goal deadline:
              </span>
              {current.goalDeadlines.map((goal) => (
                <Link
                  key={goal.id}
                  href={`/goals/${goal.id}`}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-xs font-medium hover:underline",
                    goal.health === "delayed" || goal.health === "at_risk"
                      ? "border-status-blocked-dot/40 bg-status-blocked-bg text-status-blocked-fg"
                      : goal.health === "needs_attention"
                        ? "border-status-awaiting-dot/40 bg-status-awaiting-bg text-status-awaiting-fg"
                        : "border-status-completed-dot/40 bg-status-completed-bg text-status-completed-fg",
                  )}
                >
                  {goal.title} · {HEALTH_LABELS[goal.health]}
                </Link>
              ))}
            </div>
          ) : null}

          <ul className="mt-2.5 grid gap-1">
            {current.tasks.length === 0 ? (
              <li className="text-[12px] text-muted-foreground">{current.future ? "Nothing falls due on this day." : "No task was completed, blocked or due on this day."}</li>
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
        <p className="mt-2 text-center text-[11px] text-muted-foreground italic">Hover over or click a day to see its tasks; the shaded days are ahead. Zoom for fewer or more days.</p>
      )}
    </section>
  );
}
