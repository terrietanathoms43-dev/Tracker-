"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { ERR, fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { findTeamByName, lockTeam, workerIdsAmong } from "@/lib/dal/teams";
import { log } from "@/lib/log";
import { canManageTeams } from "@/lib/permissions";
import { uniqueIds } from "@/lib/tasks/assignees";
import { requireViewer } from "@/lib/viewer";

// Teams: named groups of members that work can be assigned to (docs/PLAN.md, 2026-10-18 log). Admins and leaders
// create them, rename them and change their members; deleting one takes it off every task and goal (the history
// keeps its name). Each mutation follows the action skeleton (apex-architecture §4).

const id = z.string().min(1).max(64);

const teamFields = {
  name: z.string().trim().min(1, "Give the team a name.").max(60, "Keep the name under 60 characters."),
  description: z.string().trim().max(500).default(""),
  memberIds: z.array(id).max(200).default([]),
};

const NAME_TAKEN = "A team with that name already exists.";
const NOT_WORKERS = "Everyone on a team must be a member of this workspace (not a stakeholder).";

/** The member ids a form sent, deduplicated, and refused unless every one is a worker of this workspace. */
async function checkMembers(handle: Parameters<typeof workerIdsAmong>[0], orgId: string, memberIds: string[]): Promise<string[]> {
  const ids = uniqueIds(memberIds);
  const workers = await workerIdsAmong(handle, orgId, ids);
  if (workers.length !== ids.length) throw new GuardError("forbidden", NOT_WORKERS);
  return ids;
}

// --- create ---------------------------------------------------------------------------------------------------

const createSchema = z.object(teamFields);

/** Creates a team with its first members. Only the name is required; names are unique per workspace, ignoring case. */
export async function createTeam(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction("teams.create", createSchema, input, async (data) => {
    const viewer = await requireViewer();
    if (!canManageTeams(viewer)) throw new GuardError("forbidden", "Only leaders and admins create teams.");
    const result = await db.transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
      if ((await findTeamByName(tx, viewer.orgId, data.name)) !== null) return fail(ERR.badRequest, { name: [NAME_TAKEN] });
      const memberIds = await checkMembers(tx, viewer.orgId, data.memberIds);
      const now = new Date();
      const [created] = await tx
        .insert(teams)
        .values({ orgId: viewer.orgId, name: data.name, description: data.description || null, createdBy: viewer.userId, createdAt: now, updatedAt: now })
        .returning({ id: teams.id });
      if (memberIds.length > 0) await tx.insert(teamMembers).values(memberIds.map((userId) => ({ teamId: created.id, userId, addedBy: viewer.userId, addedAt: now })));
      return ok({ id: created.id });
    });
    if (!result.ok) return result;
    log.info("teams.created", { orgId: viewer.orgId, teamId: result.data.id, members: data.memberIds.length, by: viewer.userId });
    refresh();
    return ok(result.data, "Team created.");
  });
}

// --- edit -----------------------------------------------------------------------------------------------------------

const updateSchema = z.object({ teamId: id, ...teamFields });

/** Saves a team's name, description and members (the whole member list replaces the old one). */
export async function updateTeam(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return runAction("teams.update", updateSchema, input, async (data) => {
    const viewer = await requireViewer();
    const result = await db.transaction(async (tx): Promise<ActionResult> => {
      const team = await lockTeam(tx, viewer.orgId, data.teamId);
      if (team === null) throw new GuardError("not_found");
      if (!canManageTeams(viewer)) throw new GuardError("forbidden", "Only leaders and admins change teams.");
      const taken = await findTeamByName(tx, viewer.orgId, data.name);
      if (taken !== null && taken.id !== team.id) return fail(ERR.badRequest, { name: [NAME_TAKEN] });
      const memberIds = await checkMembers(tx, viewer.orgId, data.memberIds);
      const now = new Date();
      await tx
        .update(teams)
        .set({ name: data.name, description: data.description || null, updatedAt: now })
        .where(eq(teams.id, team.id));
      const removed = team.memberIds.filter((userId) => !memberIds.includes(userId));
      const added = memberIds.filter((userId) => !team.memberIds.includes(userId));
      if (removed.length > 0) await tx.delete(teamMembers).where(and(eq(teamMembers.teamId, team.id), inArray(teamMembers.userId, removed)));
      if (added.length > 0) await tx.insert(teamMembers).values(added.map((userId) => ({ teamId: team.id, userId, addedBy: viewer.userId, addedAt: now })));
      return ok(undefined);
    });
    if (!result.ok) return result;
    log.info("teams.updated", { orgId: viewer.orgId, teamId: data.teamId, members: data.memberIds.length, by: viewer.userId });
    refresh();
    return ok(undefined, "Team saved.");
  });
}

// --- delete ---------------------------------------------------------------------------------------------------------

const deleteSchema = z.object({ teamId: id });

/** Deletes a team. Its tasks and goals lose the team (the history keeps its name); nobody loses access to anything. */
export async function deleteTeam(input: z.input<typeof deleteSchema>): Promise<ActionResult> {
  return runAction("teams.delete", deleteSchema, input, async (data) => {
    const viewer = await requireViewer();
    const name = await db.transaction(async (tx) => {
      const team = await lockTeam(tx, viewer.orgId, data.teamId);
      if (team === null) throw new GuardError("not_found");
      if (!canManageTeams(viewer)) throw new GuardError("forbidden", "Only leaders and admins delete teams.");
      // task_teams, goal_teams and team_members go with it (cascades in db/schema.ts).
      await tx.delete(teams).where(eq(teams.id, team.id));
      return team.name;
    });
    log.info("teams.deleted", { orgId: viewer.orgId, teamId: data.teamId, name, by: viewer.userId });
    // No refresh() here: the team page would re-render as Not found while the button navigates to Members, which
    // refreshes itself once it gets there.
    return ok(undefined, `Team "${name}" deleted.`);
  });
}
