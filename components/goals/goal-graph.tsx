"use client";

import { cn } from "cn";
import { GitBranch, Repeat } from "lucide-react";
import Link from "next/link";
import type { GoalListItem, GoalLinkRow } from "@/lib/dal/goals";
import { allEdges, layoutGraph } from "@/lib/goals/graph";
import { formatDay } from "@/lib/time";
import { isPastTarget } from "./goal-parts";

// The branch view (docs/PLAN.md, 2026-11-03 log): goals as cards on a big canvas that scrolls both ways, left to
// right in the order they lead into each other (lib/goals/graph.ts lays them out), solid arrows for "leads to",
// dashed ones from a goal to its sub-goals. Click a card to open the goal; the arrows are drawn in one SVG behind.

const NODE_W = 260;
const NODE_H = 118;
const GAP_X = 72;
const GAP_Y = 20;
const PAD = 24;

function pctOf(progress: GoalListItem["progress"]): number {
  return progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
}

export function GoalGraph({ goals, links, today, showProject }: { goals: GoalListItem[]; links: GoalLinkRow[]; today: string; showProject: boolean }) {
  const nodes = goals.map((goal) => ({ id: goal.id, parentId: goal.parent?.id ?? null }));
  const layout = layoutGraph(nodes, links);
  const edges = allEdges(nodes, links);
  const position = (id: string) => {
    const place = layout.positions.get(id) ?? { column: 0, row: 0 };
    return { x: PAD + place.column * (NODE_W + GAP_X), y: PAD + place.row * (NODE_H + GAP_Y) };
  };
  const width = PAD * 2 + layout.columns.length * NODE_W + Math.max(0, layout.columns.length - 1) * GAP_X;
  const rows = Math.max(1, ...layout.columns.map((column) => column.length));
  const height = PAD * 2 + rows * NODE_H + Math.max(0, rows - 1) * GAP_Y;
  const hierarchy = new Set(nodes.filter((node) => node.parentId !== null).map((node) => `${node.parentId}>${node.id}`));

  return (
    <div className="overflow-auto rounded-lg border bg-muted/20" data-testid="goal-graph" style={{ maxHeight: "70dvh" }}>
      <div className="relative" style={{ width, height }}>
        <svg width={width} height={height} className="absolute inset-0" aria-hidden>
          <defs>
            <marker id="goal-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
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
        </svg>
        {goals.map((goal) => {
          const place = position(goal.id);
          const late = isPastTarget(goal, today);
          const pct = pctOf(goal.progress);
          return (
            <Link
              key={goal.id}
              href={`/goals/${goal.id}`}
              data-goal-node={goal.id}
              className={cn(
                "absolute flex flex-col gap-1 rounded-lg border bg-card p-3 text-left shadow-xs transition-colors outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
                late && "border-status-blocked-dot/60 bg-status-blocked-bg/40",
                goal.status === "completed" && "opacity-70",
              )}
              style={{ left: place.x, top: place.y, width: NODE_W, height: NODE_H }}
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
      </div>
    </div>
  );
}
