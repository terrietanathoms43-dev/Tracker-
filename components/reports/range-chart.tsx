"use client";

import { cn } from "cn";
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Flag, Maximize2, OctagonAlert, Pin, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { StatusIcon } from "@/components/status-badge";
import { useStatusCatalog } from "@/components/status-catalog";
import { statusDef } from "@/lib/statuses";
import { Button } from "@/components/ui/button";
import type { Timeline, TimelineBlock } from "@/lib/reports/data";
import { HEALTH_LABELS, HEALTH_ORDER, type HealthStatus } from "@/lib/reports/health";
import type { Pace } from "@/lib/reports/pace";
import { TIMELINE_LOOKAHEAD_DAYS } from "@/lib/reports/range";
import { BAND_LABELS, BLOCK_KIND_LABELS, HEALTHY_FROM_DAYS, WARM_FROM_DAYS, type BlockKind, type Shade } from "@/lib/tasks/model";
import { formatDay } from "@/lib/time";

// The Activity widget (docs/PLAN.md, 2026-11-01, 2026-11-03 and 2026-11-24 logs). One column per calendar day from
// the start of the range to two weeks past today. The y axis is the day's activity: every history row of every live
// task in scope (a completion, a comment, an edit, a status change, each +1), drawn as the grey line and its wash.
//
// The blocks are the task model (lib/tasks/model.ts): every live task has exactly ONE block, and where it sits says
// where it is in its life. Behind Today is history: a closed task stays on the day it closed, for good. On Today is
// what is on the table: what closed today, what is due today, everything overdue (carried along until it is closed)
// and everything with no due date. Ahead of Today is the plan: open work on its due date.
//
// The colour says what the block is (the phase: slate not started, blue in progress, amber awaiting approval, green
// completed or merged, purple rejected or cancelled) and the BRIGHTNESS says the timing, one rule for every colour:
// the darker the block, the later. Open work goes from the lightest (four days or more left) through two steps to
// the darkest (overdue, which also wears a red edge); closed work is light when it closed early, the base colour on
// its due date, dark when late. Marks say the rest: stripes for blocked, a pale outlined block for no due date, and
// × / › inside the three ways of closing that are not a plain completion.
//
// The chart fills its card with no scrollbar: zoom shows fewer or more days (anchored on today) and ‹ › move along
// the window. Hovering a day keeps its tasks on show until another day is hovered; clicking pins it.

const PAD_LEFT = 30;
const PAD_RIGHT = 8;
const PAD_TOP = 30;
const PAD_BOTTOM = 28;
const HEIGHT = 220;
const PLOT = HEIGHT - PAD_TOP - PAD_BOTTOM;
/** A bar never fills its slot (<= 24px, the rest is air) and never vanishes. */
const MAX_BAR = 22;
const MIN_BAR = 3;
/** One task is one block of this height; a day whose stack would not fit the plot shrinks every block to fit. */
const BLOCK = 12;
/** Blocks never shrink below this: a taller stack draws what fits and says how many more there are. */
const MIN_BLOCK = 6;
const MAX_STACK = Math.floor(PLOT / MIN_BLOCK);
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

/**
 * The base colour of each kind of block, as an OKLCH hue and chroma: the phase picks it. The lightness is not here:
 * it is one of four steps (--block-l-1 … 4 in globals.css, light and dark), so a step is the same amount lighter or
 * darker whatever the colour.
 */
const BASE: Record<BlockKind, { hue: number; chroma: number }> = {
  not_started: { hue: 255, chroma: 0.03 },
  in_progress: { hue: 255, chroma: 0.15 },
  awaiting_approval: { hue: 75, chroma: 0.14 },
  completed: { hue: 150, chroma: 0.15 },
  merged: { hue: 150, chroma: 0.15 },
  rejected: { hue: 318, chroma: 0.15 },
  cancelled: { hue: 318, chroma: 0.15 },
};
const fillOf = (kind: BlockKind, shade: Shade) => `oklch(var(--block-l-${shade}) ${BASE[kind].chroma} ${BASE[kind].hue})`;
const inkOf = (shade: Shade) => `var(--block-ink-${shade})`;
/** A block with no due date is pale with an edge in its own colour: there is no timing for its brightness to say. */
const UNDATED_OPACITY = 0.28;
const UNDATED_EDGE: Shade = 3;

/** The legend's kinds, in the order a task moves through them. */
const KINDS: readonly BlockKind[] = ["not_started", "in_progress", "awaiting_approval", "completed", "merged", "rejected", "cancelled"];
const KIND_BADGE: Record<BlockKind, string> = {
  not_started: "bg-status-slate-bg text-status-slate-fg",
  in_progress: "bg-status-blue-bg text-status-blue-fg",
  awaiting_approval: "bg-status-amber-bg text-status-amber-fg",
  completed: "bg-status-green-bg text-status-green-fg",
  merged: "bg-status-green-bg text-status-green-fg",
  rejected: "bg-status-rose-bg text-status-rose-fg",
  cancelled: "bg-status-stone-bg text-status-stone-fg",
};

const isOverdue = (block: TimelineBlock) => block.band === "overdue";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Due in 3 days", "Due tomorrow", "Overdue 2 days", "No due date": an open block's deadline in words. */
function dueText(block: TimelineBlock): string {
  if (block.daysLeft === null) return "No due date";
  if (block.daysLeft < 0) return `Overdue ${plural(-block.daysLeft, "day")}`;
  if (block.daysLeft === 0) return "Due today";
  return block.daysLeft === 1 ? "Due tomorrow" : `Due in ${block.daysLeft} days`;
}

/** How a closed block's timing reads: a completion is early, on time or late; any other closure is told by the calendar alone. */
function closedText(block: TimelineBlock): string {
  if (block.timing === "none") return "no due date when closed";
  if (block.phase === "completed") return block.timing === "early" ? "early" : block.timing === "current" ? "on time" : "late";
  return block.timing === "early" ? "before its due date" : block.timing === "current" ? "on its due date" : "after its due date";
}

/** The whole of a block in one line, for its tooltip: "In progress · blocked · due in 3 days (Warm)". */
function describeBlock(block: TimelineBlock): string {
  if (block.state === "closed") return `${BLOCK_KIND_LABELS[block.kind]}, ${closedText(block)}`;
  const due = dueText(block);
  return [BLOCK_KIND_LABELS[block.kind], block.blocked ? "blocked" : null, block.band !== null && block.band !== "overdue" ? `${due.toLowerCase()} (${BAND_LABELS[block.band]})` : due.toLowerCase()].filter(Boolean).join(" · ");
}

/**
 * The mark inside a block that was closed some way other than a plain completion: a cross (rejected), a slash
 * (cancelled), an arrow joining (merged). Nothing for the other kinds, or when the block is too small to hold one
 * (the tooltip and the day's list still say which it is).
 */
function closureMark(kind: BlockKind, x: number, y: number, width: number, height: number): string | null {
  if (kind !== "rejected" && kind !== "cancelled" && kind !== "merged") return null;
  const half = (Math.min(width, height) - 4) / 2;
  if (half < 1.5) return null;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const p = (dx: number, dy: number) => `${(cx + dx).toFixed(1)},${(cy + dy).toFixed(1)}`;
  if (kind === "rejected") return `M${p(-half, -half)} L${p(half, half)} M${p(-half, half)} L${p(half, -half)}`;
  if (kind === "cancelled") return `M${p(-half, half)} L${p(half, -half)}`;
  return `M${p(-half * 0.7, -half)} L${p(half * 0.7, 0)} L${p(-half * 0.7, half)}`;
}

/** A goal deadline pin wears the goal's health, so an at-risk or delayed deadline is red before anyone hovers. */
const PIN_TONE: Record<HealthStatus, { fill: string; stroke: string }> = {
  delayed: { fill: "fill-status-red-dot", stroke: "stroke-status-red-dot" },
  at_risk: { fill: "fill-status-red-dot", stroke: "stroke-status-red-dot" },
  needs_attention: { fill: "fill-status-amber-dot", stroke: "stroke-status-amber-dot" },
  on_track: { fill: "fill-status-green-dot", stroke: "stroke-status-green-dot" },
};

/** The worst health among the goals due on one day: that is the colour the day's pin takes. */
const worstHealth = (markers: { health: HealthStatus }[]): HealthStatus => HEALTH_ORDER.find((health) => markers.some((marker) => marker.health === health)) ?? "on_track";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The top block of a stack: rounded at the data end, square below (and at every seam). */
function topBlockPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(RADIUS, height / 2, width / 2);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

/** How a block is painted: its colour at its brightness, the red edge of overdue work, the pale fill and own-colour edge of undated work. */
function paintOf(block: Pick<TimelineBlock, "kind" | "shade" | "band" | "undated">, hovered = false): { fill: string; fillOpacity: number; stroke: string; strokeWidth: number } {
  const fill = fillOf(block.kind, block.shade);
  if (block.band === "overdue") return { fill, fillOpacity: 1, stroke: "var(--status-red-dot)", strokeWidth: 1.5 };
  if (block.undated) return { fill, fillOpacity: UNDATED_OPACITY, stroke: hovered ? "var(--foreground)" : fillOf(block.kind, UNDATED_EDGE), strokeWidth: 1.25 };
  return { fill, fillOpacity: 1, stroke: hovered ? "var(--foreground)" : "none", strokeWidth: 1 };
}
/** The colour of a mark inside a block: the block's ink, or its own dark colour when the block is pale. */
const markInk = (block: Pick<TimelineBlock, "kind" | "shade" | "undated">) => (block.undated ? fillOf(block.kind, 4) : inkOf(block.shade));

/** A legend swatch, drawn the way the chart draws that block. */
function Swatch({ kind, shade = 2, blocked = false, undated = false, overdue = false, hatchId }: { kind: BlockKind; shade?: Shade; blocked?: boolean; undated?: boolean; overdue?: boolean; hatchId: string }) {
  const mark = closureMark(kind, 0, 0, 12, 12);
  const block = { kind, shade, band: overdue ? ("overdue" as const) : null, undated };
  const paint = paintOf(block);
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0" aria-hidden>
      <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="3" style={{ fill: paint.fill, fillOpacity: paint.fillOpacity, stroke: paint.stroke, strokeWidth: paint.stroke === "none" ? 0 : paint.strokeWidth }} />
      {blocked ? <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="3" fill={`url(#${hatchId})`} /> : null}
      {mark !== null ? <path d={mark} fill="none" style={{ stroke: markInk(block) }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  );
}

/** The four brightness steps of one colour, lightest first: how the legend shows that brightness is the timing. */
function Ramp({ kind, steps, hatchId }: { kind: BlockKind; steps: readonly Shade[]; hatchId: string }) {
  return (
    <span className="inline-flex gap-px" aria-hidden>
      {steps.map((shade) => (
        <Swatch key={shade} kind={kind} shade={shade} hatchId={hatchId} />
      ))}
    </span>
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
  const track = tone === "behind" ? "bg-status-red-bg" : tone === "good" ? "bg-status-green-bg" : "bg-muted";
  const fill = tone === "behind" ? "bg-status-red-dot" : tone === "good" ? "bg-status-green-dot" : "bg-primary";
  const markerLeft = `clamp(10px, ${expected * 100}%, calc(100% - 10px))`;
  return (
    <div className="mb-4 rounded-lg border bg-muted/30 px-3 pt-2.5 pb-2" data-testid="pace-strip" data-verdict={pace.verdict}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
        <p className={cn("flex items-center gap-1.5 font-medium", tone === "behind" ? "text-status-red-fg" : tone === "good" ? "text-status-green-fg" : "text-foreground")}>
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
          {expected < 0.9 ? <span className="absolute right-0">100%</span> : null}
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
}: {
  timeline: Timeline;
  today: string;
  /** The My work view: only the blocks of tasks assigned to the viewer are drawn; the activity line and the pace stay the project's. */
  showMyWork?: boolean;
  title: string;
  /** One sentence under the title: what this view's widget draws. */
  description?: string;
  /** The scope's pace towards its target date, drawn as a thermometer above the days. */
  pace?: Pace | null;
}) {
  const hatchId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(ASSUMED_WIDTH);
  /** How many days are on show (null = the default for this width) and which day the view starts at (null = ending at the window's end). */
  const [zoom, setZoom] = useState<number | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const statuses = useStatusCatalog();
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

  const days = timeline.days.map((day) => ({
    ...day,
    blocks: showMyWork ? day.blocks.filter((block) => block.isMine) : day.blocks,
  }));
  const total = days.length;
  const todayIndex = Math.max(
    0,
    days.findIndex((day) => day.date === today),
  );
  const outsideAfter = showMyWork ? timeline.outside.after.mine : timeline.outside.after.all;
  const outsideBefore = showMyWork ? timeline.outside.before.mine : timeline.outside.before.all;

  // How many blocks of each kind the window draws: the legend's counts, and a kind with none is dimmed there.
  const all = days.flatMap((day) => day.blocks);
  const countOf = (kind: BlockKind) => all.filter((block) => block.kind === kind).length;
  const totals = {
    blocks: all.length,
    completed: all.filter((block) => block.phase === "completed").length,
    overdue: all.filter(isOverdue).length,
    undated: all.filter((block) => block.state === "open" && block.undated).length,
    blocked: all.filter((block) => block.blocked).length,
    goals: days.reduce((sum, day) => sum + day.goalDeadlines.length, 0),
    activity: days.reduce((sum, day) => sum + day.activity, 0),
  };

  if (total === 0 || totals.blocks + totals.goals + totals.activity + outsideAfter + outsideBefore === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-[13px] text-muted-foreground">
        {showMyWork ? "Nothing of yours is open, was closed or falls due in this window." : "Nothing is open, was closed or happened in this window."}
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

  // The y axis is the day's activity count. The blocks are counts of tasks: a fixed height each, shrunk together when
  // a day's stack would not fit the plot, and never below MIN_BLOCK: a taller stack says "+N" above what fits.
  const scale = Math.max(MIN_SCALE, ...view.filter((day) => !day.future).map((day) => day.activity));
  const tallest = Math.max(1, ...view.map((day) => Math.min(day.blocks.length, MAX_STACK)));
  const unit = Math.min(BLOCK, PLOT / tallest);
  const drawnOn = (day: (typeof days)[number]) => (day.blocks.length > MAX_STACK ? day.blocks.slice(0, MAX_STACK - 1) : day.blocks);
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
    totals.blocked > 0 ? `${totals.blocked} blocked` : null,
    totals.undated > 0 ? `${totals.undated} with no due date` : null,
    outsideAfter > 0 ? `${outsideAfter} due after this window` : null,
    outsideBefore > 0 ? `${outsideBefore} open before this window` : null,
    totals.goals > 0 ? `${totals.goals} goal ${totals.goals === 1 ? "deadline" : "deadlines"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const overdueNote = totals.overdue > 0 ? `${totals.overdue} overdue` : null;
  const first = view[0];
  const last = view[view.length - 1];
  const todayX = PAD_LEFT + (todayIndex - viewStart) * slot + slot / 2;
  const todayInView = todayIndex >= viewStart && todayIndex < viewStart + shown;

  /** A day's blocks in words: what the column's tooltip and screen readers say. */
  const describeDay = (day: (typeof days)[number]) =>
    [
      formatDay(day.date, today),
      !day.future ? `${day.activity} ${day.activity === 1 ? "event" : "events"}` : null,
      ...KINDS.filter((kind) => day.blocks.some((block) => block.kind === kind)).map((kind) => `${day.blocks.filter((block) => block.kind === kind).length} ${BLOCK_KIND_LABELS[kind].toLowerCase()}`),
      day.blocks.some(isOverdue) ? `${day.blocks.filter(isOverdue).length} overdue` : null,
      day.blocks.length === 0 ? "no tasks" : null,
      day.goalDeadlines.length > 0 ? `${day.goalDeadlines.length} goal deadline${day.goalDeadlines.length === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(", ");

  return (
    // min-w-0: a grid item would otherwise grow to its content and push the whole report past the screen.
    <section aria-labelledby="range-chart-title" className="min-w-0 max-w-full rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="range-chart-title" className="text-base font-semibold">
            {title}
          </h2>
          {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
          <p className="text-[12px] text-muted-foreground" data-widget-summary>
            {overdueNote ? <span className="font-semibold text-status-red-fg">{overdueNote} · </span> : null}
            {summary} · to {TIMELINE_LOOKAHEAD_DAYS} days ahead
          </p>
        </div>
      </div>

      {/* The legend: what a block is (its colour and mark), what its brightness says, and the other marks. */}
      <div className="mb-3 grid gap-1.5 text-[11px] text-muted-foreground">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Blocks on the chart" data-status-legend>
          <li className="font-medium text-foreground">{showMyWork ? "One block per task of yours:" : "One block per task:"}</li>
          {KINDS.map((kind) => (
            <li key={kind} className={cn("flex items-center gap-1.5", countOf(kind) === 0 && "opacity-55")} data-legend-kind={kind} data-count={countOf(kind)}>
              <Swatch kind={kind} hatchId={hatchId} />
              {BLOCK_KIND_LABELS[kind]}
              {countOf(kind) > 0 ? <span className="font-medium text-foreground tabular-nums">{countOf(kind)}</span> : null}
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="What the brightness says" data-timing-legend>
          <li className="font-medium text-foreground">Darker is later:</li>
          <li className="flex items-center gap-1.5">
            <Ramp kind="in_progress" steps={[1, 2, 3, 4]} hatchId={hatchId} />
            open work: {HEALTHY_FROM_DAYS}+ days left, {WARM_FROM_DAYS}–{HEALTHY_FROM_DAYS - 1} days, due today or tomorrow, overdue
          </li>
          <li className="flex items-center gap-1.5">
            <Ramp kind="completed" steps={[1, 2, 3]} hatchId={hatchId} />
            closed work: early, on its due date, late
          </li>
        </ul>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Marks">
          <li className={cn("flex items-center gap-1.5", totals.overdue === 0 && "opacity-55")} data-legend-mark="overdue" data-count={totals.overdue}>
            <Swatch kind="in_progress" shade={4} overdue hatchId={hatchId} />
            Overdue
            {totals.overdue > 0 ? <span className="font-medium text-foreground tabular-nums">{totals.overdue}</span> : null}
          </li>
          <li className={cn("flex items-center gap-1.5", totals.blocked === 0 && "opacity-55")} data-legend-mark="blocked" data-count={totals.blocked}>
            <Swatch kind="in_progress" blocked hatchId={hatchId} />
            Blocked
            {totals.blocked > 0 ? <span className="font-medium text-foreground tabular-nums">{totals.blocked}</span> : null}
          </li>
          <li className={cn("flex items-center gap-1.5", totals.undated === 0 && "opacity-55")} data-legend-mark="undated" data-count={totals.undated}>
            <Swatch kind="not_started" undated hatchId={hatchId} />
            No due date
            {totals.undated > 0 ? <span className="font-medium text-foreground tabular-nums">{totals.undated}</span> : null}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-full bg-muted-foreground" aria-hidden />
            Activity per day (the axis)
          </li>
          {totals.goals > 0 ? (
            <li className="flex items-center gap-1.5">
              <span className="flex -space-x-1" aria-hidden>
                <span className="size-2.5 rounded-full bg-status-red-dot ring-1 ring-card" />
                <span className="size-2.5 rounded-full bg-status-green-dot ring-1 ring-card" />
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
          aria-label={`One column per day, ${shown} days on show, one block per task. The axis is events per day. ${overdueNote ? `${overdueNote}. ` : ""}${summary}. Hover or focus a day to list its tasks.`}
          onMouseLeave={() => setHoverTask(null)}
        >
          <defs>
            {/* Blocked: red stripes laid over the block's own colour, with a light seam so they read on every step. */}
            <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="1" y1="0" x2="1" y2="5" stroke="var(--status-red-dot)" strokeWidth="2" />
              <line x1="2.5" y1="0" x2="2.5" y2="5" stroke="var(--card)" strokeWidth="1" strokeOpacity="0.7" />
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
            const dayDescription = describeDay(day);
            const drawn = drawnOn(day);
            const hidden = day.blocks.length - drawn.length;
            const stackTop = baseline - drawn.length * unit;
            const overdue = day.blocks.filter(isOverdue).length;
            return (
              <g key={day.date} data-day={day.date} data-future={day.future || undefined} data-in-range={day.inRange || undefined} data-blocks={day.blocks.length}>
                {/* The column: the hit target for the whole day (the blocks are smaller than a fingertip). */}
                <rect
                  x={x0}
                  y={0}
                  width={slot}
                  height={HEIGHT}
                  tabIndex={0}
                  role="button"
                  aria-label={dayDescription}
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
                  <title>{dayDescription}</title>
                </rect>

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
                {drawn.map((block, position) => {
                  const top = baseline - (position + 1) * unit + GAP;
                  const height = Math.max(unit - GAP, 2);
                  const isTop = position === drawn.length - 1;
                  const key = `${day.date}:${block.id}`;
                  const hovered = hoverTask === key;
                  const paint = paintOf(block, hovered);
                  const mark = closureMark(block.kind, x, top, bar, height);
                  const shape = isTop ? { d: topBlockPath(x, top, bar, height) } : null;
                  const style: CSSProperties = { ...paint, opacity: hovered || hoverTask === null ? 1 : 0.75 };
                  const common = {
                    style,
                    "data-block": block.kind,
                    "data-shade": block.shade,
                    "data-timing": block.band ?? block.timing,
                    "data-undated": block.undated || undefined,
                    "data-blocked": block.blocked || undefined,
                    onMouseEnter: () => setHoverTask(key),
                    onMouseLeave: () => setHoverTask(null),
                    className: "pointer-events-auto",
                  } as const;
                  const tip = `${block.title}: ${describeBlock(block)}`;
                  return (
                    <g key={key}>
                      {shape ? (
                        <path {...shape} {...common}>
                          <title>{tip}</title>
                        </path>
                      ) : (
                        <rect x={x} y={top} width={bar} height={height} {...common}>
                          <title>{tip}</title>
                        </rect>
                      )}
                      {block.blocked ? shape ? <path {...shape} fill={`url(#${hatchId})`} className="pointer-events-none" /> : <rect x={x} y={top} width={bar} height={height} fill={`url(#${hatchId})`} className="pointer-events-none" /> : null}
                      {mark !== null ? <path d={mark} fill="none" style={{ stroke: markInk(block) }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none" data-block-mark={block.kind} /> : null}
                    </g>
                  );
                })}

                {/* A stack too tall to draw says how many more it holds; overdue work on the day says so above it. */}
                {hidden > 0 || overdue > 0 ? (
                  <text x={x0 + slot / 2} y={stackTop - 5} textAnchor="middle" className="pointer-events-none text-[10px] font-semibold select-none">
                    {overdue > 0 ? <tspan className="fill-status-red-fg text-[12px] font-bold">!</tspan> : null}
                    {hidden > 0 ? (
                      <tspan className="fill-muted-foreground" dx={overdue > 0 ? 2 : 0}>
                        +{hidden}
                      </tspan>
                    ) : null}
                  </text>
                ) : null}

                {/* A quiet dot on an empty past day keeps the axis readable. */}
                {day.blocks.length === 0 && !day.future && slot >= 10 ? <circle cx={x0 + slot / 2} cy={baseline} r="1.5" className="fill-muted-foreground" fillOpacity="0.35" /> : null}

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
              {current.blocks.some(isOverdue) ? <span className="rounded-sm bg-status-red-dot px-1.5 py-0.5 font-semibold text-white">{current.blocks.filter(isOverdue).length} overdue</span> : null}
              <span className="font-medium text-foreground">{plural(current.blocks.length, "task")}</span>
              {current.blocks.some((block) => block.phase === "completed") ? <span className="font-medium text-status-green-fg">{current.blocks.filter((block) => block.phase === "completed").length} completed</span> : null}
              {current.blocks.some((block) => block.blocked) ? <span className="font-medium text-status-red-fg">{current.blocks.filter((block) => block.blocked).length} blocked</span> : null}
            </div>
          </div>

          {current.goalDeadlines.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-status-amber-fg">
                <Flag className="size-3" aria-hidden /> Goal deadline:
              </span>
              {current.goalDeadlines.map((goal) => (
                <Link
                  key={goal.id}
                  href={`/goals/${goal.id}`}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-xs font-medium hover:underline",
                    goal.health === "delayed" || goal.health === "at_risk"
                      ? "border-status-red-dot/40 bg-status-red-bg text-status-red-fg"
                      : goal.health === "needs_attention"
                        ? "border-status-amber-dot/40 bg-status-amber-bg text-status-amber-fg"
                        : "border-status-green-dot/40 bg-status-green-bg text-status-green-fg",
                  )}
                >
                  {goal.title} · {HEALTH_LABELS[goal.health]}
                </Link>
              ))}
            </div>
          ) : null}

          {/* Each task once, with what it is and its timing as badges; never a second row for its deadline. */}
          <ul className="mt-2.5 grid gap-1">
            {current.blocks.length === 0 ? (
              <li className="text-[12px] text-muted-foreground">{current.future ? "Nothing is due on this day." : "No task was closed on this day."}</li>
            ) : (
              current.blocks.map((block) => {
                const key = `${current.date}:${block.id}`;
                return (
                  <li
                    key={key}
                    className={cn("flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs transition-colors", hoverTask === key && "bg-accent")}
                    onMouseEnter={() => setHoverTask(key)}
                    onMouseLeave={() => setHoverTask(null)}
                    data-day-task={block.id}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <StatusIcon status={statusDef(statuses, block.blocked ? "blocked" : block.kind)} className="size-3.5" />
                      <Link href={`/tasks/${block.id}`} className="truncate font-medium text-foreground hover:underline">
                        {block.title}
                      </Link>
                      {block.project ? <span className="hidden truncate text-muted-foreground sm:inline">· {block.project}</span> : null}
                    </div>
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      {block.blocked ? <span className="rounded-xs bg-status-red-bg px-1.5 py-0.5 text-[10px] font-medium text-status-red-fg">Blocked</span> : null}
                      <span className={cn("rounded-xs px-1.5 py-0.5 text-[10px] font-medium", KIND_BADGE[block.kind])}>{BLOCK_KIND_LABELS[block.kind]}</span>
                      {block.state === "open" ? (
                        <span
                          className={cn(
                            "rounded-xs px-1.5 py-0.5 text-[10px] font-medium",
                            block.band === "overdue"
                              ? "bg-status-red-dot text-white"
                              : block.band === "at_risk" || block.undated
                                ? "bg-status-amber-bg text-status-amber-fg"
                                : "bg-muted text-muted-foreground",
                          )}
                          data-timing-badge={block.band ?? "undated"}
                        >
                          {dueText(block)}
                        </span>
                      ) : (
                        <span className="rounded-xs bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" data-timing-badge={block.timing}>
                          {closedText(block)}
                        </span>
                      )}
                      {/* The warning follows the task as it is now: a date set after closing clears it; the block's mark stays. */}
                      {block.state === "closed" && block.noDueDateNow ? <span className="rounded-xs bg-status-amber-bg px-1.5 py-0.5 text-[10px] font-medium text-status-amber-fg">No due date</span> : null}
                    </span>
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
