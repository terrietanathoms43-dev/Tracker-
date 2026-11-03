import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { progressForGoals, recentActivity } from "@/lib/dal/tasks";
import { canReadPlanning, type Viewer } from "@/lib/permissions";
import type { ActivityFeedItem, Person, TaskProgress } from "@/lib/tasks/types";

// Reads behind Home and Reports that are not about one task list: active goals with their progress, and the feed
// of important changes. Scoped by viewer.orgId, and narrowed to the navigation's project when one is chosen.

// --- goals ---------------------------------------------------------------------------------------------------

/** An active goal and how much of the work under it is done (completed / total, never a percentage of effort). */
export type GoalProgress = { id: string; title: string; targetDate: string | null; projectName: string } & TaskProgress;

/**
 * Active top-level goals, nearest target date first (undated last), each with its task progress (lib/dal/tasks.ts
 * progressForGoals: direct tasks and sub-goals' tasks).
 */
export async function activeGoalProgress(viewer: Viewer, limit = 20, project = ""): Promise<GoalProgress[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await db
    .select({ id: goals.id, title: goals.title, targetDate: goals.targetDate, projectName: sql<string>`(select p.name from projects p where p.id = ${goals}.project_id)` })
    .from(goals)
    .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active"), sql`${goals.parentGoalId} is null`, project ? eq(goals.projectId, project) : undefined))
    .orderBy(sql`${goals.targetDate} asc nulls last`, asc(goals.title))
    .limit(limit);
  const progress = await progressForGoals(
    viewer,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, ...(progress.get(row.id) ?? { completed: 0, total: 0, blocked: 0, overdue: 0 }) }));
}

// --- the important-changes feed ---------------------------------------------------------------------------------

/** One line of the feed: "Morgan Lead approved Fix nightly backup", linking to the task. */
export type FeedEntry = {
  id: string;
  actor: Person;
  verb: string;
  subject: { title: string; href: string };
  /** The whole sentence in plain text, for tooltips and screen readers. */
  summary: string;
  note: string | null;
  at: string;
};

const fromTask = (item: ActivityFeedItem): FeedEntry => ({
  id: `task-${item.id}`,
  actor: item.actor,
  verb: item.verb,
  subject: { title: item.task.title, href: item.href },
  summary: item.summary,
  note: item.note,
  at: item.at,
});

/**
 * The important changes in the workspace, newest first (docs/PLAN.md §8): decisions and problems from
 * recentActivity (completed, blocked, unblocked, approved, sent back, rejected, due changed, reopened, proposals
 * decided). Edits and progress updates are left out on purpose: this is not a log.
 */
export async function teamFeed(viewer: Viewer, limit: number, project = "", since?: Date): Promise<FeedEntry[]> {
  const items = await recentActivity(viewer, limit, since, project);
  return items.map(fromTask);
}
