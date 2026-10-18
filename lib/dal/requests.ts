import "server-only";
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Tx } from "@/db";
import { requestDecisions, requests, tasks, users } from "@/db/schema";
import type { RequestStatus } from "@/lib/constants";
import { isStakeholder, type RequestScope, type Viewer } from "@/lib/permissions";
import { groupRequestSections, RECENTLY_DECIDED_DAYS } from "@/lib/requests/filters";
import type { RequestDecisionItem, RequestDetail, RequestListItem, RequestSections } from "@/lib/requests/types";
import type { Person } from "@/lib/tasks/types";

// Every read of requests: the requests page, the review queue, Home's banner and "Your requests", and the request
// page. Each function takes the Viewer and filters by its workspace in SQL; stakeholders only ever see their own.

const requesterUser = alias(users, "requester_user");
const deciderUser = alias(users, "decider_user");

/** The tenancy boundary for requests: this workspace, and for stakeholders only what they asked for. */
function visibility(viewer: Viewer): SQL {
  const inOrg = eq(requests.orgId, viewer.orgId);
  return isStakeholder(viewer) ? and(inOrg, eq(requests.requesterId, viewer.userId))! : inOrg;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

// --- list rows -------------------------------------------------------------------------------------------------

const listColumns = {
  id: requests.id,
  title: requests.title,
  status: requests.status,
  urgency: requests.urgency,
  createdAt: requests.createdAt,
  decidedAt: requests.decidedAt,
  decisionReason: requests.decisionReason,
  deferUntil: requests.deferUntil,
  requesterId: requesterUser.id,
  requesterName: requesterUser.name,
  requesterEmail: requesterUser.email,
  requesterImage: requesterUser.image,
  taskId: tasks.id,
  taskStatus: tasks.status,
};

type ListRow = {
  id: string;
  title: string;
  status: RequestStatus;
  urgency: RequestListItem["urgency"];
  createdAt: Date;
  decidedAt: Date | null;
  decisionReason: string | null;
  deferUntil: string | null;
  requesterId: string;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterImage: string | null;
  taskId: string | null;
  taskStatus: NonNullable<RequestListItem["task"]>["status"] | null;
};

function toListItem(row: ListRow): RequestListItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    urgency: row.urgency,
    requester: { id: row.requesterId, name: row.requesterName, email: row.requesterEmail, image: row.requesterImage },
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionReason: row.decisionReason,
    deferUntil: row.deferUntil,
    task: row.taskId && row.taskStatus ? { id: row.taskId, status: row.taskStatus } : null,
  };
}

/** `select <list row> from requests` with who asked and, once converted, the task it became. */
function selectList() {
  return db
    .select(listColumns)
    .from(requests)
    .innerJoin(requesterUser, eq(requesterUser.id, requests.requesterId))
    .leftJoin(tasks, and(eq(tasks.id, requests.convertedTaskId), eq(tasks.orgId, requests.orgId)));
}

// --- lists ---------------------------------------------------------------------------------------------------------

export type RequestView = "open" | "all" | "decided";

/** open = still moving (waiting, deferred, or approved and not yet a task); decided = settled. */
const VIEW_STATUSES: Record<RequestView, RequestStatus[]> = {
  open: ["new", "deferred", "approved"],
  decided: ["rejected", "converted"],
  all: [],
};

export type RequestListOptions = {
  view?: RequestView;
  /** Only requests the viewer submitted. */
  mine?: boolean;
  status?: RequestStatus | "";
  /** Title search. */
  q?: string;
};

/** Requests the viewer may see, newest first: the filtered list, a stakeholder's own, Home's "Your requests". */
export async function listRequests(viewer: Viewer, options: RequestListOptions = {}, limit = 200): Promise<RequestListItem[]> {
  const where: SQL[] = [visibility(viewer)];
  const statuses = VIEW_STATUSES[options.view ?? "all"];
  if (statuses.length > 0) where.push(inArray(requests.status, statuses));
  if (options.status) where.push(eq(requests.status, options.status));
  if (options.mine) where.push(eq(requests.requesterId, viewer.userId));
  if (options.q) where.push(ilike(requests.title, `%${escapeLike(options.q)}%`));
  const rows = await selectList()
    .where(and(...where))
    .orderBy(desc(requests.createdAt), desc(requests.id))
    .limit(limit);
  return rows.map(toListItem);
}

/**
 * The review queue (apex-ux flow G) in one round trip: every new, deferred and approved request, plus those rejected
 * or converted in the last RECENTLY_DECIDED_DAYS, sorted into their sections by lib/requests/filters.ts.
 */
export async function requestSections(viewer: Viewer, today: string): Promise<RequestSections> {
  const recentlyDecided = and(
    inArray(requests.status, ["rejected", "converted"]),
    sql`${requests.decidedAt} > now() - make_interval(days => ${RECENTLY_DECIDED_DAYS}::int)`,
  );
  const rows = await selectList()
    .where(and(visibility(viewer), or(inArray(requests.status, ["new", "deferred", "approved"]), recentlyDecided)))
    .limit(500);
  return groupRequestSections(rows.map(toListItem), today);
}

/** How many requests wait for a decision (status new): the leader's Home banner. */
export async function countPendingRequests(viewer: Viewer): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(requests)
    .where(and(visibility(viewer), eq(requests.status, "new")));
  return row?.n ?? 0;
}

// --- one request -------------------------------------------------------------------------------------------------

/** One request with its decision history, plus the scope its permission checks need (null when not found). */
export async function getRequest(viewer: Viewer, id: string): Promise<{ detail: RequestDetail; scope: RequestScope } | null> {
  const [row] = await db
    .select({
      request: requests,
      requester: sql<Person>`json_build_object('id', ${requesterUser.id}, 'name', ${requesterUser.name}, 'email', ${requesterUser.email}, 'image', ${requesterUser.image})`,
      decidedBy: sql<Person | null>`case when ${deciderUser.id} is null then null else json_build_object('id', ${deciderUser.id}, 'name', ${deciderUser.name}, 'email', ${deciderUser.email}, 'image', ${deciderUser.image}) end`,
      decisions: sql<(Omit<RequestDecisionItem, "at"> & { at: string })[]>`coalesce((
        select json_agg(json_build_object('id', d.id, 'decision', d.decision, 'reason', d.reason, 'at', d.created_at,
          'decider', json_build_object('id', du.id, 'name', du.name, 'email', du.email, 'image', du.image)) order by d.created_at desc, d.id desc)
        from ${requestDecisions} d join ${users} du on du.id = d.decider_id where d.request_id = ${requests.id}), '[]'::json)`,
    })
    .from(requests)
    .innerJoin(requesterUser, eq(requesterUser.id, requests.requesterId))
    .leftJoin(deciderUser, eq(deciderUser.id, requests.decidedBy))
    .where(and(eq(requests.id, id), eq(requests.orgId, viewer.orgId)));
  if (!row) return null;
  const r = row.request;
  const detail: RequestDetail = {
    id: r.id,
    title: r.title,
    description: r.description,
    desiredOutcome: r.desiredOutcome,
    urgency: r.urgency,
    link: r.link,
    status: r.status,
    requester: row.requester,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decidedBy: row.decidedBy,
    decisionReason: r.decisionReason,
    deferUntil: r.deferUntil,
    taskId: r.convertedTaskId,
    decisions: row.decisions.map((decision) => ({ ...decision, at: new Date(decision.at).toISOString() })),
  };
  return { detail, scope: { orgId: r.orgId, requesterId: r.requesterId } };
}

/**
 * The request row an action works on, locked (`select … for update`) for the rest of the transaction. Null when
 * the id is unknown or belongs to another workspace.
 */
export async function lockRequest(tx: Tx, orgId: string, id: string) {
  const [row] = await tx
    .select()
    .from(requests)
    .where(and(eq(requests.id, id), eq(requests.orgId, orgId)))
    .for("update");
  return row ?? null;
}
