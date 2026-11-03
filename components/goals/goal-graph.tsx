"use client";

import { cn } from "cn";
import { GitBranch, Repeat, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { linkGoals, unlinkGoals } from "@/actions/goals";
import type { GoalListItem, GoalLinkRow } from "@/lib/dal/goals";
import { allEdges, layoutGraph } from "@/lib/goals/graph";
import { formatDay } from "@/lib/time";
import { toastResult } from "@/lib/toast-result";
import { isPastTarget } from "./goal-parts";

// The branch view (docs/PLAN.md, 2026-11-03 and 2026-11-04 logs): goals as cards on a big canvas that scrolls both
// ways, left to right in the order they lead into each other (lib/goals/graph.ts lays them out), solid arrows for
// "leads to", dashed ones from a goal to its sub-goals. Click a card to open the goal. Whoever manages planning
// draws an arrow by dragging the dot on a card onto another card, and takes one away with the × on it.

const NODE_W = 260;
const NODE_H = 118;
const GAP_X = 72;
const GAP_Y = 20;
const PAD = 24;

function pctOf(progress: GoalListItem["progress"]): number {
  return progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
}

type Drag = { from: string; x: number; y: number };

export function GoalGraph({ goals, links, today, showProject, canEdit = false }: { goals: GoalListItem[]; links: GoalLinkRow[]; today: string; showProject: boolean; canEdit?: boolean }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nodes = goals.map((goal) => ({ id: goal.id, parentId: goal.parent?.id ?? null }));
  const layout = layoutGraph(nodes, links);
  const edges = allEdges(nodes, links);
  const titles = new Map(goals.map((goal) => [goal.id, goal.title]));
  const position = (id: string) => {
    const place = layout.positions.get(id) ?? { column: 0, row: 0 };
    return { x: PAD + place.column * (NODE_W + GAP_X), y: PAD + place.row * (NODE_H + GAP_Y) };
  };
  const width = PAD * 2 + layout.columns.length * NODE_W + Math.max(0, layout.columns.length - 1) * GAP_X;
  const rows = Math.max(1, ...layout.columns.map((column) => column.length));
  const height = PAD * 2 + rows * NODE_H + Math.max(0, rows - 1) * GAP_Y;
  const hierarchy = new Set(nodes.filter((node) => node.parentId !== null).map((node) => `${node.parentId}>${node.id}`));

  /** The pointer, in the canvas's own coordinates (it scrolls inside the frame, so its box moves with it). */
  const localPoint = (event: ReactPointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: 0, y: 0 };
  };
  const nodeUnder = (event: ReactPointerEvent): string | null => {
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-goal-node]");
    return hit?.dataset.goalNode ?? null;
  };
  const link = (from: string, to: string) => startTransition(async () => void toastResult(await linkGoals({ fromGoalId: from, toGoalId: to })));
  const unlink = (from: string, to: string) => startTransition(async () => void toastResult(await unlinkGoals({ fromGoalId: from, toGoalId: to })));

  return (
    <div className={cn("overflow-auto rounded-lg border bg-muted/20", pending && "opacity-70")} data-testid="goal-graph" style={{ maxHeight: "70dvh" }}>
      <div ref={canvasRef} className="relative" style={{ width, height }}>
        <svg width={width} height={height} className="absolute inset-0" aria-hidden>
          <defs>
            <marker id="goal-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
            </marker>
            <marker id="goal-arrow-draft" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const from = position(edge.from);
            const to = position(edge.to);
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const bend = Math.max(24, (x2 - x1) / 2);
            const dashed = hierarchy.has(`${edge.from}>${edge.to}`);
            return (
              <path
                key={`${edge.from}>${edge.to}`}
                d={`M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`}
                fill="none"
                className="stroke-muted-foreground"
                strokeWidth="1.5"
                strokeOpacity="0.7"
                strokeDasharray={dashed ? "5 4" : undefined}
                markerEnd="url(#goal-arrow)"
                data-edge={dashed ? "sub-goal" : "link"}
              />
            );
          })}
          {drag
            ? (() => {
                const from = position(drag.from);
                const x1 = from.x + NODE_W;
                const y1 = from.y + NODE_H / 2;
                const bend = Math.max(24, Math.abs(drag.x - x1) / 2);
                return <path d={`M${x1},${y1} C${x1 + bend},${y1} ${drag.x - bend},${drag.y} ${drag.x},${drag.y}`} fill="none" className="stroke-primary" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#goal-arrow-draft)" data-edge="draft" />;
              })()
            : null}
        </svg>
        {goals.map((goal) => {
          const place = position(goal.id);
          const late = isPastTarget(goal, today);
          const pct = pctOf(goal.progress);
          const target = drag !== null && over === goal.id && drag.from !== goal.id;
          return (
            <Link
              key={goal.id}
              href={`/goals/${goal.id}`}
              data-goal-node={goal.id}
              className={cn(
                "absolute flex flex-col gap-1 rounded-lg border bg-card p-3 text-left shadow-xs transition-colors outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
                late && "border-status-blocked-dot/60 bg-status-blocked-bg/40",
                goal.status === "completed" && "opacity-70",
                target && "ring-2 ring-primary",
                drag !== null && "cursor-crosshair",
              )}
              style={{ left: place.x, top: place.y, width: NODE_W, height: NODE_H }}
              onClick={(event) => {
                if (drag !== null) event.preventDefault();
              }}
            >
              <span className="flex items-start gap-1.5">
                {goal.parent ? <GitBranch className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Sub-goal" role="img" /> : null}
                <span className="line-clamp-2 text-sm leading-snug font-semibold">{goal.title}</span>
              </span>
              <span className="truncate text-[12px] text-muted-foreground">
                {showProject ? `${goal.project.name} · ` : ""}
                {goal.status !== "active" ? goal.status : goal.targetDate ? (late ? `Target passed ${formatDay(goal.targetDate, today)}` : `Target ${formatDay(goal.targetDate, today)}`) : "No target date"}
                {goal.repeats ? (
                  <>
                    {" · "}
                    <Repeat className="inline size-3" aria-hidden /> repeats
                  </>
                ) : null}
              </span>
              <span className="mt-auto flex items-center gap-2 text-[12px] text-muted-foreground tabular-nums">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className={cn("block h-full rounded-full", late ? "bg-status-blocked-dot" : "bg-highlight")} style={{ width: `${pct}%` }} />
                </span>
                {goal.progress.completed}/{goal.progress.total}
              </span>
              {late ? <span className="sr-only">Past its target and not marked completed.</span> : null}
            </Link>
          );
        })}
        {canEdit
          ? goals.map((goal) => {
              const place = position(goal.id);
              return (
                <button
                  key={`port-${goal.id}`}
                  type="button"
                  data-goal-port={goal.id}
                  aria-label={`Connect “${goal.title}” to a goal it leads to: drag this onto that goal`}
                  title="Drag onto another goal: this one leads there"
                  disabled={pending}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    // Capture keeps the move and the release coming to this dot wherever the pointer goes.
                    try {
                      event.currentTarget.setPointerCapture(event.pointerId);
                    } catch {
                      /* a pointer that can't be captured still drags: the window's own events arrive */
                    }
                    const point = localPoint(event);
                    setDrag({ from: goal.id, x: point.x, y: point.y });
                    setOver(null);
                  }}
                  onPointerMove={(event) => {
                    if (drag === null || drag.from !== goal.id) return;
                    const point = localPoint(event);
                    setDrag({ from: goal.id, x: point.x, y: point.y });
                    setOver(nodeUnder(event));
                  }}
                  onPointerUp={(event) => {
                    if (drag === null) return;
                    try {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    } catch {
                      /* never captured */
                    }
                    const to = nodeUnder(event);
                    setDrag(null);
                    setOver(null);
                    if (to !== null && to !== goal.id) link(goal.id, to);
                  }}
                  onPointerCancel={() => {
                    setDrag(null);
                    setOver(null);
                  }}
                  className={cn(
                    "absolute z-10 grid size-5 cursor-crosshair touch-none place-items-center rounded-full border-2 border-primary bg-background shadow-sm transition-transform outline-none hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring",
                    drag?.from === goal.id && "scale-125",
                  )}
                  style={{ left: place.x + NODE_W - 10, top: place.y + NODE_H / 2 - 10 }}
                >
                  <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                </button>
              );
            })
          : null}
        {canEdit
          ? edges
              .filter((edge) => !hierarchy.has(`${edge.from}>${edge.to}`))
              .map((edge) => {
                const from = position(edge.from);
                const to = position(edge.to);
                const x1 = from.x + NODE_W;
                const y1 = from.y + NODE_H / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_H / 2;
                const bend = Math.max(24, (x2 - x1) / 2);
                // The curve's middle: a cubic Bézier at t = 0.5.
                const mx = (x1 + 3 * (x1 + bend) + 3 * (x2 - bend) + x2) / 8;
                const my = (y1 + y2) / 2;
                return (
                  <button
                    key={`unlink-${edge.from}>${edge.to}`}
                    type="button"
                    data-unlink={`${edge.from}>${edge.to}`}
                    aria-label={`Remove the arrow from “${titles.get(edge.from) ?? "a goal"}” to “${titles.get(edge.to) ?? "a goal"}”`}
                    title="Remove this arrow"
                    disabled={pending}
                    onClick={() => unlink(edge.from, edge.to)}
                    className="absolute z-10 grid size-[18px] place-items-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors outline-none hover:border-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ left: mx - 9, top: my - 9 }}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                );
              })
          : null}
      </div>
    </div>
  );
}
