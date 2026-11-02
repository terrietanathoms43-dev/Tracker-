import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { goals } from "@/db/schema";
import type { CaptureContext } from "@/lib/capture/draft";
import { projectOptions } from "@/lib/dal/projects";
import { taskPeople } from "@/lib/dal/tasks";
import type { Viewer } from "@/lib/permissions";
import { dayKey } from "@/lib/time";

// What the meeting helper is allowed to point at (docs/PLAN.md, 2026-11-01 log): this workspace's workers, its
// active projects and its active goals, read once per draft and handed to the model as the only ids it may use.

/** The workspace as the helper sees it. `defaultProjectId` is kept only when it names an active project here. */
export async function captureContext(viewer: Viewer, defaultProjectId: string): Promise<CaptureContext> {
  const [people, projects, goalRows] = await Promise.all([
    taskPeople(viewer),
    projectOptions(viewer),
    db
      .select({ id: goals.id, title: goals.title, parentGoalId: goals.parentGoalId, targetDate: goals.targetDate })
      .from(goals)
      .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active")))
      .orderBy(asc(goals.title)),
  ]);
  return {
    today: dayKey(new Date(), viewer.timezone),
    timezone: viewer.timezone,
    people: people.map(({ id, name, email, image }) => ({ id, name, email, image })),
    projects,
    goals: goalRows,
    defaultProjectId: projects.some((project) => project.id === defaultProjectId) ? defaultProjectId : "",
  };
}
