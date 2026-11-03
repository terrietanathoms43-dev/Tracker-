import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { projects } from "@/db/schema";
import type { ProjectStatus } from "@/lib/constants";
import type { Viewer } from "@/lib/permissions";
import { parseProjectScope, PROJECT_SCOPE_COOKIE, type ProjectScope } from "@/lib/project-scope";

/** The project a page is narrowed to, as the sidebar picker shows it. */
export type ScopedProject = { id: string; name: string; status: ProjectStatus };

/** The raw scope in the browser's cookie ("" when none). */
export async function readProjectScope(): Promise<ProjectScope> {
  const raw = (await cookies()).get(PROJECT_SCOPE_COOKIE)?.value;
  try {
    return parseProjectScope(raw === undefined ? raw : decodeURIComponent(raw));
  } catch {
    return parseProjectScope(raw);
  }
}

/**
 * The scope checked against the workspace: the project when the cookie names one of this workspace's projects,
 * otherwise null (and the scope reads as "all projects"). A stale id from another workspace never narrows a page.
 */
export async function scopedProject(viewer: Viewer): Promise<ScopedProject | null> {
  const scope = await readProjectScope();
  if (scope === "") return null;
  const [row] = await db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .where(and(eq(projects.id, scope), eq(projects.orgId, viewer.orgId)));
  return row ?? null;
}

/** The scope as the DAL filters want it: a project id, or "" for the whole workspace. */
export async function projectScopeFor(viewer: Viewer): Promise<ProjectScope> {
  return (await scopedProject(viewer))?.id ?? "";
}
