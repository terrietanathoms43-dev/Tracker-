import "server-only";
import { and, asc, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { goals, requestDecisions, requests, users } from "@/db/schema";
import type { RequestDecision } from "@/lib/constants";
import { progressForGoals, recentActivity } from "@/lib/dal/tasks";
import { canReadPlanning, isStakeholder, type Viewer } from "@/lib/permissions";
import type { ActivityFeedItem, Person, TaskProgress } from "@/lib/tasks/types";

// Reads behind Home, Team and Reports that are not about one task list: active goals with their progress,
// and the feed of important changes (task decisions and request decisions together). Scoped by viewer.orgId.

// --- goals ---------------------------------------------------------------------------------------------------

/** An active goal and how much of the work under it is done (completed / total, never a percentage of effort). */
export type GoalProgress = { id: string; title: string; targetDate: string | null } & TaskProgress;

/**
 * Active goals, nearest target date first (undated last), each with its task progress counted directly and
 * through its projects (lib/dal/tasks.ts progressForGoals). Stakeholders do not see goals.
 */
export async function activeGoalProgress(viewer: Viewer, limit = 20): Promise<GoalProgress[]> {
  if (!canReadPlanning(viewer)) return [];
  const rows = await db
    .select({ id: goals.id, title: goals.title, targetDate: goals.targetDate })
    .from(goals)
    .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active")))
    .orderBy(sql`${goals.targetDate} asc nulls last`, asc(goals.title))
    .limit(limit);
  const progress = await progressForGoals(
    viewer,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, ...(progress.get(row.id) ?? { completed: 0, total: 0, blocked: 0, overdue: 0 }) }));
}

// --- the important-changes feed ---------------------------------------------------------------------------------

/** One line of the feed: "Morgan Lead approved Fix nightly backup", linking to the task or request. */
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

const REQUEST_VERBS: Record<RequestDecision, string> = {
  approved: "approved the request",
  deferred: "deferred the request",
  rejected: "rejected the request",
  converted: "made a task from the request",
  reopened: "reopened the request",
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

/** Request decisions, newest first. A stakeholder only ever sees decisions on their own requests. */
async function requestDecisionFeed(viewer: Viewer, limit: number, since?: Date): Promise<FeedEntry[]> {
  const decider = alias(users, "decider_user");
  const where: SQL[] = [eq(requests.orgId, viewer.orgId)];
  if (isStakeholder(viewer)) where.push(eq(requests.requesterId, viewer.userId));
  if (since) where.push(gte(requestDecisions.createdAt, since));
  const rows = await db
    .select({
      id: requestDecisions.id,
      decision: requestDecisions.decision,
      reason: requestDecisions.reason,
      createdAt: requestDecisions.createdAt,
      requestId: requests.id,
      requestTitle: requests.title,
      actorId: decider.id,
      actorName: decider.name,
      actorEmail: decider.email,
      actorImage: decider.image,
    })
    .from(requestDecisions)
    .innerJoin(requests, eq(requests.id, requestDecisions.requestId))
    .innerJoin(decider, eq(decider.id, requestDecisions.deciderId))
    .where(and(...where))
    .orderBy(desc(requestDecisions.createdAt), desc(requestDecisions.id))
    .limit(limit);
  return rows.map((row) => {
    const verb = REQUEST_VERBS[row.decision];
    return {
      id: `request-${row.id}`,
      actor: { id: row.actorId, name: row.actorName, email: row.actorEmail, image: row.actorImage },
      verb,
      subject: { title: row.requestTitle, href: `/requests/${row.requestId}` },
      summary: `${row.actorName ?? row.actorEmail ?? "Someone"} ${verb} ${row.requestTitle}`,
      note: row.reason,
      at: row.createdAt.toISOString(),
    };
  });
}

/**
 * The important changes in the workspace, newest first (docs/PLAN.md §8): task decisions and problems from
 * recentActivity (completed, blocked, unblocked, approved, sent back, rejected, due changed, reopened) merged
 * with request decisions. Edits and progress updates are left out on purpose: this is not a log.
 */
export async function teamFeed(viewer: Viewer, limit: number, since?: Date): Promise<FeedEntry[]> {
  const [taskItems, decisions] = await Promise.all([recentActivity(viewer, limit, since), requestDecisionFeed(viewer, limit, since)]);
  return [...taskItems.map(fromTask), ...decisions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
