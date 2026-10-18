/**
 * The seeded test personas and demo workspaces for test mode (see lib/test-mode.ts; the content is in seed-data.ts).
 *
 *   npm run test:seed     create / reset everything (idempotent) and rewrite docs/TEST-ACCOUNTS.md
 *   npm run test:status   what exists right now
 *   npm run test:tidy     put both workspaces back to the seeded state; remove workspaces a test run created
 *   npm run test:clean    delete both workspaces and every .test account
 *
 * Run with: npx tsx scripts/test-accounts.ts <seed|status|tidy|clean>
 *
 * Safety: only a workspace whose EVERY member is a .test account is ever reset or deleted; anything else makes the
 * command refuse, and because each command is one transaction, a refusal changes nothing. Users are upserted by
 * email and workspaces are reset in place, so ids survive and open test sessions stay valid across a re-seed.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq, inArray, like, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { CLOSED_STATUSES, ORG_ROLE_LABELS, REQUEST_STATUS_LABELS, TASK_STATUS_LABELS, type TaskActivityKind } from "@/lib/constants";
import { TEST_EMAIL_DOMAIN, TEST_HOME, TEST_PERSONAS, type TestPersona } from "@/lib/test-mode";
import { dayKey } from "@/lib/time";
import { DEMO, OTHER, PEOPLE, type OrgSeed, type Person, type SeedTask } from "./seed-data";

const {
  users,
  sessions,
  organizations,
  organizationMembers,
  invitations,
  goals,
  projects,
  requests,
  requestDecisions,
  tasks,
  taskUpdates,
  taskLinks,
  taskActivity,
  notifications,
  notificationPreferences,
} = schema;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const LIKE_TEST = `%${TEST_EMAIL_DOMAIN}`;
const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;
const DAY = 24 * HOUR;

/** The two seeded workspaces, in the order they are written. */
const SEEDED: OrgSeed[] = [DEMO, OTHER];

type Ids = Record<Person, string>;

/** A refusal: printed as-is, and the transaction it was thrown in rolls back. */
class Refusal extends Error {}

// --- time ----------------------------------------------------------------------------------

/** The seed's relative times, made real from a single instant so every row agrees on what "now" was. */
function clockFor(now: number, timeZone: string) {
  return {
    /** An instant `daysAgo` days back; `plusSeconds` orders events that happen "at the same time". */
    at: (daysAgo: number, plusSeconds = 0) => new Date(now - daysAgo * DAY + plusSeconds * SECOND),
    /** A calendar day `inDays` from today in the workspace's timezone (negative = in the past). */
    due: (inDays: number) => dayKey(new Date(now + inDays * DAY), timeZone),
  };
}
type Clock = ReturnType<typeof clockFor>;

// --- people ---------------------------------------------------------------------------------

/** The personas and Casey, created or refreshed in place (ids survive, so open sessions stay valid). */
async function ensureUsers(tx: Tx): Promise<Ids> {
  const ids = {} as Ids;
  for (const [person, account] of Object.entries(PEOPLE) as [Person, { email: string; name: string }][]) {
    const [row] = await tx
      .insert(users)
      .values({ email: account.email, name: account.name, emailVerified: true })
      .onConflictDoUpdate({ target: users.email, set: { name: account.name, image: null, timezone: null } })
      .returning({ id: users.id });
    ids[person] = row.id;
  }
  // Everyone starts from the default email preferences (the column defaults in db/schema.ts).
  const userIds = Object.values(ids);
  await tx.delete(notificationPreferences).where(inArray(notificationPreferences.userId, userIds));
  await tx.insert(notificationPreferences).values(userIds.map((userId) => ({ userId })));
  return ids;
}

// --- which workspaces may be touched -------------------------------------------------------

/** Workspaces that belong to test accounts alone: at least one .test member and no other kind. */
async function testOnlyOrgIds(tx: Tx): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    select o.id from organizations o
    where exists (select 1 from organization_members m join users u on u.id = m.user_id
                  where m.org_id = o.id and u.email like ${LIKE_TEST})
      and not exists (select 1 from organization_members m join users u on u.id = m.user_id
                      where m.org_id = o.id and (u.email is null or u.email not like ${LIKE_TEST}))`);
  return rows.rows.map((row) => row.id);
}

/** Refuses when a seeded slug is taken by a workspace that has a real (non-.test) member. */
async function assertSeededSlugsAreTestOnly(tx: Tx, testOnly: Set<string>): Promise<void> {
  for (const { org } of SEEDED) {
    const [existing] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, org.slug));
    if (!existing || testOnly.has(existing.id)) continue;
    const real = await tx.execute<{ email: string | null }>(sql`
      select u.email from organization_members m join users u on u.id = m.user_id
      where m.org_id = ${existing.id} and (u.email is null or u.email not like ${LIKE_TEST}) limit 1`);
    if (real.rows.length > 0) {
      throw new Refusal(`The workspace with slug "${org.slug}" has a real member (${real.rows[0].email ?? "no email"}); refusing to touch it.`);
    }
  }
}

/** The workspace row for a seeded slug: kept (stable id, emptied) when it exists, created otherwise. */
async function claimOrg(tx: Tx, seed: OrgSeed, createdBy: string): Promise<string> {
  const [existing] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, seed.org.slug));
  if (existing) {
    await tx.update(organizations).set({ name: seed.org.name, timezone: seed.org.timezone, createdBy }).where(eq(organizations.id, existing.id));
    await wipeOrgContents(tx, existing.id);
    return existing.id;
  }
  const [created] = await tx
    .insert(organizations)
    .values({ name: seed.org.name, slug: seed.org.slug, timezone: seed.org.timezone, createdBy })
    .returning({ id: organizations.id });
  return created.id;
}

/** Everything inside a workspace, but not the workspace row itself. */
async function wipeOrgContents(tx: Tx, orgId: string): Promise<void> {
  await tx.delete(notifications).where(eq(notifications.orgId, orgId));
  await tx.delete(taskActivity).where(eq(taskActivity.orgId, orgId));
  // Tasks take their updates and links with them; requests take their decisions (cascades).
  await tx.delete(tasks).where(eq(tasks.orgId, orgId));
  await tx.delete(requests).where(eq(requests.orgId, orgId));
  await tx.delete(projects).where(eq(projects.orgId, orgId));
  await tx.delete(goals).where(eq(goals.orgId, orgId));
  await tx.delete(invitations).where(eq(invitations.orgId, orgId));
  await tx.delete(organizationMembers).where(eq(organizationMembers.orgId, orgId));
}

async function deleteOrgs(tx: Tx, orgIds: string[]): Promise<void> {
  for (const orgId of orgIds) await wipeOrgContents(tx, orgId);
  if (orgIds.length > 0) await tx.delete(organizations).where(inArray(organizations.id, orgIds));
}

// --- seed data checks (pure) ------------------------------------------------------------------

/** Everyone a workspace's seed mentions must be one of its members: Other Co can never point at Trackwise Demo. */
function assertSelfContained(seed: OrgSeed): void {
  const members = new Set(seed.members.map((member) => member.person));
  const mentioned: (Person | null)[] = [
    seed.createdBy,
    ...seed.goals.flatMap((goal) => [goal.owner, goal.createdBy]),
    ...seed.projects.flatMap((project) => [project.owner, project.createdBy]),
    ...seed.requests.flatMap((request) => [request.requester, ...request.decisions.map((decision) => decision.by)]),
    ...seed.tasks.flatMap((task) => [
      task.assignee,
      task.createdBy,
      ...task.updates.map((update) => update.author),
      ...(task.comments ?? []).map((comment) => comment.author),
      task.approval?.approver ?? null,
      task.completed?.approvedBy ?? null,
      task.rejection?.by ?? null,
    ]),
    ...seed.notifications.map((notification) => notification.person),
  ];
  const strangers = [...new Set(mentioned.filter((person): person is Person => person !== null && !members.has(person)))];
  if (strangers.length > 0) throw new Error(`${seed.org.name}'s seed mentions non-members: ${strangers.join(", ")}`);
}

/** A task's state blocks must agree with its status (e.g. only a blocked task has `blocked`). */
function assertTaskConsistent(spec: SeedTask): void {
  const pairs: [boolean, boolean, string][] = [
    [spec.status === "blocked", spec.blocked !== undefined, "blocked"],
    [spec.status === "awaiting_approval", spec.approval !== undefined, "approval"],
    [spec.status === "completed", spec.completed !== undefined, "completed"],
    [spec.status === "rejected", spec.rejection !== undefined, "rejection"],
  ];
  for (const [hasStatus, hasBlock, block] of pairs) {
    if (hasStatus !== hasBlock) throw new Error(`Seed task "${spec.title}" is ${spec.status} but ${hasBlock ? "has" : "lacks"} \`${block}\``);
  }
  if (spec.status !== "not_started" && spec.status !== "completed" && spec.status !== "rejected" && spec.updates.length === 0) {
    throw new Error(`Seed task "${spec.title}" is ${spec.status} but has no progress update to resume from`);
  }
}

/** A key lookup that fails loudly on a typo in seed-data.ts instead of writing a null. */
function lookup(map: Map<string, string>, key: string, what: string): string {
  const id = map.get(key);
  if (id === undefined) throw new Error(`Seed data refers to an unknown ${what} "${key}"`);
  return id;
}

// --- one task, as rows (pure) ----------------------------------------------------------------

type TaskRow = typeof tasks.$inferInsert;
type UpdateRow = typeof taskUpdates.$inferInsert;
type LinkRow = typeof taskLinks.$inferInsert;
type ActivityRow = typeof taskActivity.$inferInsert;

type TaskContext = {
  orgId: string;
  clock: Clock;
  who: (person: Person) => string;
  projectId: (key: string) => string;
  goalId: (key: string) => string;
  requestId: (key: string) => string;
};

/**
 * Turns a task spec into the task row, its updates and links, and the activity trail that explains how it got
 * there: created → assigned → started → updates / comments / links → blocked | approval asked | approved +
 * completed | rejected. Same-instant events are a second apart so history reads in the right order.
 */
function taskRows(spec: SeedTask, taskId: string, ctx: TaskContext): { task: TaskRow; updates: UpdateRow[]; links: LinkRow[]; activity: ActivityRow[] } {
  const { at, due } = ctx.clock;
  const { orgId, who } = ctx;
  const createdAt = at(spec.createdDaysAgo);
  const creator = who(spec.createdBy);
  // Whoever moves the task along day to day.
  const worker = who(spec.assignee ?? spec.createdBy);
  const last = spec.updates.at(-1);
  const approverId = spec.approval ? who(spec.approval.approver) : spec.completed?.approvedBy ? who(spec.completed.approvedBy) : null;

  const activity: ActivityRow[] = [];
  const log = (kind: TaskActivityKind, actorId: string, when: Date, extra: Partial<ActivityRow> = {}) =>
    activity.push({ orgId, taskId, actorId, kind, createdAt: when, ...extra });

  log("created", creator, createdAt, spec.request ? { after: { requestId: ctx.requestId(spec.request) } } : {});
  if (spec.assignee !== null && spec.assignee !== spec.createdBy) {
    log("assigned", creator, at(spec.createdDaysAgo, 1), { before: { assigneeId: null }, after: { assigneeId: who(spec.assignee) } });
  }

  // Started an hour before the first thing that happened to it (never before it existed).
  let startedAt: Date | null = null;
  if (spec.status !== "not_started") {
    const firstDaysAgo = Math.max(
      ...[spec.updates[0]?.daysAgo, spec.blocked?.daysAgo, spec.approval?.daysAgo, spec.completed?.daysAgo, spec.rejection?.daysAgo].filter(
        (value): value is number => value !== undefined,
      ),
    );
    startedAt = new Date(Math.max(createdAt.getTime() + 2 * SECOND, at(firstDaysAgo).getTime() - HOUR));
    log("status_changed", worker, startedAt, { before: { status: "not_started" }, after: { status: "in_progress" } });
  }

  const updates: UpdateRow[] = [];
  for (const update of spec.updates) {
    const when = at(update.daysAgo);
    updates.push({ taskId, authorId: who(update.author), kind: "progress", body: update.body, nextAction: update.next, blocker: update.blocker ?? null, createdAt: when });
    log("progress_updated", who(update.author), when);
  }
  for (const comment of spec.comments ?? []) {
    const when = at(comment.daysAgo);
    updates.push({ taskId, authorId: who(comment.author), kind: "comment", body: comment.body, createdAt: when });
    log("commented", who(comment.author), when);
  }

  const links: LinkRow[] = [];
  for (const link of spec.links ?? []) {
    const when = at(link.daysAgo ?? last?.daysAgo ?? spec.createdDaysAgo, 2);
    links.push({ taskId, url: link.url, label: link.label, addedBy: worker, createdAt: when });
    log("link_added", worker, when, { after: { url: link.url, label: link.label } });
  }

  if (spec.blocked) {
    const { daysAgo, reason, by } = spec.blocked;
    log("blocked", worker, at(daysAgo, 1), { before: { status: "in_progress" }, after: { status: "blocked", blockedReason: reason, blockedBy: by }, note: reason });
  }
  if (spec.approval) {
    log("approval_requested", worker, at(spec.approval.daysAgo, 1), {
      before: { status: "in_progress" },
      after: { status: "awaiting_approval", approverId: who(spec.approval.approver) },
    });
  }
  if (spec.completed) {
    const { daysAgo, summary, approvedBy } = spec.completed;
    if (approvedBy) {
      log("approval_requested", worker, at(last?.daysAgo ?? daysAgo, 1), {
        before: { status: "in_progress" },
        after: { status: "awaiting_approval", approverId: who(approvedBy) },
      });
      log("approved", who(approvedBy), at(daysAgo), { before: { status: "awaiting_approval" }, after: { status: "completed" } });
      log("completed", who(approvedBy), at(daysAgo, 1), { after: { status: "completed" }, note: summary });
    } else {
      log("completed", worker, at(daysAgo, 1), { before: { status: "in_progress" }, after: { status: "completed" }, note: summary });
    }
  }
  if (spec.rejection) {
    const { daysAgo, by, reason } = spec.rejection;
    log("rejected", who(by), at(daysAgo, 1), { before: { status: startedAt ? "in_progress" : "not_started" }, after: { status: "rejected" }, note: reason });
  }

  const task: TaskRow = {
    id: taskId,
    orgId,
    projectId: spec.project ? ctx.projectId(spec.project) : null,
    goalId: spec.goal ? ctx.goalId(spec.goal) : null,
    requestId: spec.request ? ctx.requestId(spec.request) : null,
    title: spec.title,
    description: spec.description ?? null,
    assigneeId: spec.assignee ? who(spec.assignee) : null,
    createdBy: creator,
    approverId,
    priority: spec.priority,
    status: spec.status,
    dueDate: spec.dueInDays === null ? null : due(spec.dueInDays),
    startedAt,
    completedAt: spec.completed ? at(spec.completed.daysAgo, 1) : null,
    blockedReason: spec.blocked?.reason ?? null,
    blockedBy: spec.blocked?.by ?? null,
    rejectionReason: spec.rejection?.reason ?? null,
    // Denormalised from the newest progress update (docs/PLAN.md §5); comments never touch these.
    latestProgress: last?.body ?? null,
    nextAction: last?.next ?? null,
    completionSummary: spec.completed?.summary ?? null,
    sortRank: spec.sortRank ?? 0,
    createdAt,
    updatedAt: new Date(Math.max(...activity.map((row) => (row.createdAt as Date).getTime()))),
  };
  return { task, updates, links, activity };
}

// --- one workspace ------------------------------------------------------------------------------

type SeededOrg = { orgId: string; name: string; tasks: number; requests: number };

async function seedOrg(tx: Tx, seed: OrgSeed, ids: Ids, now: number): Promise<SeededOrg> {
  assertSelfContained(seed);
  seed.tasks.forEach(assertTaskConsistent);
  const clock = clockFor(now, seed.org.timezone);
  const { at, due } = clock;
  const who = (person: Person) => ids[person];
  const orgId = await claimOrg(tx, seed, who(seed.createdBy));

  await tx.insert(organizationMembers).values(
    seed.members.map(({ person, role }) => ({
      orgId,
      userId: who(person),
      role,
      joinedAt: at(seed.joinedDaysAgo),
      invitedBy: person === seed.createdBy ? null : who(seed.createdBy),
    })),
  );

  // Ids are chosen up front so rows can point at each other before they are written.
  const goalIds = new Map(seed.goals.map((goal) => [goal.key, crypto.randomUUID()]));
  const projectIds = new Map(seed.projects.map((project) => [project.key, crypto.randomUUID()]));
  const requestIds = new Map(seed.requests.map((request) => [request.key, crypto.randomUUID()]));
  const taskIds = new Map(seed.tasks.map((task, index) => [task.key ?? `#${index}`, crypto.randomUUID()]));
  const goalId = (key: string) => lookup(goalIds, key, "goal");
  const projectId = (key: string) => lookup(projectIds, key, "project");
  const requestId = (key: string) => lookup(requestIds, key, "request");
  const taskId = (key: string) => lookup(taskIds, key, "task");

  if (seed.goals.length > 0) {
    await tx.insert(goals).values(
      seed.goals.map((goal) => ({
        id: goalId(goal.key),
        orgId,
        title: goal.title,
        description: goal.description,
        ownerId: who(goal.owner),
        targetDate: due(goal.targetInDays),
        successCriteria: goal.successCriteria,
        status: goal.status,
        createdBy: who(goal.createdBy),
        createdAt: at(goal.createdDaysAgo),
        updatedAt: at(goal.updatedDaysAgo ?? goal.createdDaysAgo),
      })),
    );
  }

  if (seed.projects.length > 0) {
    await tx.insert(projects).values(
      seed.projects.map((project) => ({
        id: projectId(project.key),
        orgId,
        goalId: project.goal ? goalId(project.goal) : null,
        name: project.name,
        description: project.description,
        ownerId: who(project.owner),
        status: project.status,
        targetDate: project.targetInDays === null ? null : due(project.targetInDays),
        createdBy: who(project.createdBy),
        createdAt: at(project.createdDaysAgo),
        updatedAt: at(project.updatedDaysAgo ?? project.createdDaysAgo),
      })),
    );
  }

  // Requests first (tasks point at them); converted_task_id is filled in once the tasks exist.
  if (seed.requests.length > 0) {
    await tx.insert(requests).values(
      seed.requests.map((request) => {
        const latest = request.decisions.at(-1);
        // A reopened request is back to "new": undecided, with its history in request_decisions.
        const standing = latest !== undefined && latest.decision !== "reopened" ? latest : undefined;
        return {
          id: requestId(request.key),
          orgId,
          title: request.title,
          description: request.description,
          desiredOutcome: request.desiredOutcome,
          urgency: request.urgency,
          link: request.link ?? null,
          requesterId: who(request.requester),
          status: request.status,
          decidedAt: standing ? at(standing.daysAgo) : null,
          decidedBy: standing ? who(standing.by) : null,
          decisionReason: standing?.reason ?? null,
          deferUntil: request.status === "deferred" && request.deferInDays !== undefined ? due(request.deferInDays) : null,
          createdAt: at(request.createdDaysAgo),
          updatedAt: at(latest?.daysAgo ?? request.createdDaysAgo),
        };
      }),
    );
    const decisions = seed.requests.flatMap((request) =>
      request.decisions.map((decision) => ({
        requestId: requestId(request.key),
        deciderId: who(decision.by),
        decision: decision.decision,
        reason: decision.reason,
        createdAt: at(decision.daysAgo),
      })),
    );
    if (decisions.length > 0) await tx.insert(requestDecisions).values(decisions);
  }

  const ctx: TaskContext = { orgId, clock, who, projectId, goalId, requestId };
  const rows = seed.tasks.map((spec, index) => taskRows(spec, taskId(spec.key ?? `#${index}`), ctx));
  if (rows.length > 0) {
    await tx.insert(tasks).values(rows.map((row) => row.task));
    const updates = rows.flatMap((row) => row.updates);
    const links = rows.flatMap((row) => row.links);
    if (updates.length > 0) await tx.insert(taskUpdates).values(updates);
    if (links.length > 0) await tx.insert(taskLinks).values(links);
    await tx.insert(taskActivity).values(rows.flatMap((row) => row.activity));
  }

  // A converted request and its task point at each other.
  for (const request of seed.requests.filter((each) => each.status === "converted")) {
    const index = seed.tasks.findIndex((task) => task.request === request.key);
    if (index === -1) throw new Error(`Converted request "${request.title}" has no task with request: "${request.key}"`);
    await tx.update(requests).set({ convertedTaskId: rows[index].task.id }).where(eq(requests.id, requestId(request.key)));
  }

  if (seed.notifications.length > 0) {
    await tx.insert(notifications).values(
      seed.notifications.map((notice) => ({
        userId: who(notice.person),
        orgId,
        kind: notice.kind,
        title: notice.title,
        body: notice.body ?? null,
        href: notice.task ? `/tasks/${taskId(notice.task)}` : notice.request ? `/requests/${requestId(notice.request)}` : TEST_HOME,
        readAt: notice.read ? at(Math.max(0, notice.daysAgo - 0.1)) : null,
        createdAt: at(notice.daysAgo),
      })),
    );
  }

  return { orgId, name: seed.org.name, tasks: seed.tasks.length, requests: seed.requests.length };
}

// --- commands -------------------------------------------------------------------------------------

/** Both workspaces back to the seed, in one transaction. Workspaces a test run created (all-.test members) go. */
async function reset(): Promise<{ seeded: SeededOrg[]; removed: number }> {
  return db.transaction(async (tx) => {
    const ids = await ensureUsers(tx);
    const testOnly = new Set(await testOnlyOrgIds(tx));
    await assertSeededSlugsAreTestOnly(tx, testOnly);
    const now = Date.now();
    const seeded: SeededOrg[] = [];
    for (const seed of SEEDED) seeded.push(await seedOrg(tx, seed, ids, now));

    const extras = [...testOnly].filter((orgId) => !seeded.some((org) => org.orgId === orgId));
    await deleteOrgs(tx, extras);
    // No stale invitations to test addresses anywhere, and no pile of expired test sign-ins.
    await tx.delete(invitations).where(like(invitations.email, LIKE_TEST));
    await tx.delete(sessions).where(and(inArray(sessions.userId, Object.values(ids)), lt(sessions.expiresAt, new Date())));
    return { seeded, removed: extras.length };
  });
}

export async function seed(): Promise<void> {
  const { seeded, removed } = await reset();
  for (const [key, persona] of Object.entries(TEST_PERSONAS)) console.log(`ready: ${key.padEnd(12)} ${persona.email.padEnd(24)} ${persona.name}`);
  for (const org of seeded) console.log(`workspace: ${org.name} (${org.tasks} tasks, ${org.requests} requests)`);
  if (removed > 0) console.log(`removed ${removed} extra test workspace(s)`);
  writeAccountsDoc();
  console.log(`\nSign in with /api/test-login?as=<persona>&secret=<TEST_MODE_SECRET>&to=${TEST_HOME} while a dev server is running.`);
}

export async function tidy(): Promise<void> {
  const { seeded, removed } = await reset();
  console.log(
    `Tidy: ${seeded.map((org) => org.name).join(" and ")} are back to the seeded state${removed > 0 ? `; removed ${removed} extra test workspace(s)` : ""}.`,
  );
}

export async function status(): Promise<void> {
  const people = await db.execute<{ email: string; name: string | null; workspaces: string }>(sql`
    select u.email, u.name,
           coalesce(string_agg(o.name || ' (' || m.role || ')', '; ' order by o.name), '-') as workspaces
    from users u
    left join organization_members m on m.user_id = u.id
    left join organizations o on o.id = m.org_id
    where u.email like ${LIKE_TEST}
    group by u.id order by u.email`);
  if (people.rows.length === 0) {
    console.log("No test accounts. Run: npm run test:seed");
    return;
  }
  console.table(people.rows);

  const testOnly = await db.transaction((tx) => testOnlyOrgIds(tx));
  const slugs = SEEDED.map((seed) => seed.org.slug);
  const orgs = await db.execute<Record<string, string | number>>(sql`
    select o.name, o.slug,
      (select count(*)::int from organization_members m where m.org_id = o.id) as members,
      (select count(*)::int from goals g where g.org_id = o.id) as goals,
      (select count(*)::int from projects p where p.org_id = o.id) as projects,
      (select count(*)::int from tasks t where t.org_id = o.id) as tasks,
      (select count(*)::int from requests r where r.org_id = o.id) as requests,
      (select count(*)::int from notifications n where n.org_id = o.id and n.read_at is null) as unread
    from organizations o
    where o.slug in (${sql.join(slugs.map((slug) => sql`${slug}`), sql`, `)})
       ${testOnly.length > 0 ? sql`or o.id in (${sql.join(testOnly.map((id) => sql`${id}`), sql`, `)})` : sql``}
    order by o.created_at`);
  console.table(orgs.rows);

  const byStatus = await db.execute<{ workspace: string; status: string; n: number }>(sql`
    select o.name as workspace, t.status, count(*)::int as n from tasks t join organizations o on o.id = t.org_id
    where o.slug in (${sql.join(slugs.map((slug) => sql`${slug}`), sql`, `)})
    group by o.name, t.status order by o.name, t.status`);
  console.table(byStatus.rows);

  const extra = orgs.rows.filter((row) => !slugs.includes(String(row.slug))).length;
  if (extra > 0) console.log(`${extra} extra test workspace(s) exist (npm run test:tidy removes them).`);
}

export async function clean(): Promise<void> {
  await db.transaction(async (tx) => {
    const testUsers = await tx.select({ id: users.id }).from(users).where(like(users.email, LIKE_TEST));
    if (testUsers.length === 0) {
      console.log("No test accounts to remove.");
      return;
    }
    const testOnly = new Set(await testOnlyOrgIds(tx));
    await assertSeededSlugsAreTestOnly(tx, testOnly);
    // A real workspace whose only admin is a test account would be left without one: refuse, and say which.
    const orphaned = await tx.execute<{ name: string }>(sql`
      select o.name from organizations o
      where exists (select 1 from organization_members m join users u on u.id = m.user_id where m.org_id = o.id and u.email not like ${LIKE_TEST})
        and not exists (select 1 from organization_members m join users u on u.id = m.user_id
                        where m.org_id = o.id and m.role = 'admin' and u.email not like ${LIKE_TEST})`);
    if (orphaned.rows.length > 0) {
      throw new Refusal(
        `A test account is the only admin of a real workspace (${orphaned.rows.map((row) => row.name).join(", ")}). Promote someone else first.`,
      );
    }
    await deleteOrgs(tx, [...testOnly]);
    await tx.delete(invitations).where(like(invitations.email, LIKE_TEST));
    // Sessions, accounts, memberships and preferences go with the user (cascade). Work a test account authored in
    // a real workspace would block this (those references are not cascaded) and roll the whole command back.
    await tx.delete(users).where(
      inArray(
        users.id,
        testUsers.map((row) => row.id),
      ),
    );
    console.log(`Removed ${testUsers.length} test account(s) and ${testOnly.size} test workspace(s).`);
  });
}

// --- docs/TEST-ACCOUNTS.md --------------------------------------------------------------------------

/** What a persona finds waiting in its workspace, computed from the seed so the doc can never drift from it. */
function startsWith(seed: OrgSeed, person: Person): string {
  const open = seed.tasks.filter((task) => task.assignee === person && !CLOSED_STATUSES.includes(task.status));
  const facts = [
    open.length > 0 ? `${open.length} open task${open.length === 1 ? "" : "s"}` : "",
    count(open.filter((task) => task.dueInDays !== null && task.dueInDays < 0).length, "overdue"),
    count(open.filter((task) => task.status === "blocked").length, "blocked"),
    count(seed.tasks.filter((task) => task.approval?.approver === person).length, "awaiting their approval"),
    count(seed.requests.filter((request) => request.requester === person).length, "request", "requests", " submitted"),
    canDecide(seed, person) ? count(seed.requests.filter((request) => request.status === "new").length, "request", "requests", " to decide") : "",
    count(seed.notifications.filter((notice) => notice.person === person && !notice.read).length, "unread notification", "unread notifications"),
    ...seed.goals.filter((goal) => goal.owner === person).map((goal) => `owns goal "${goal.title}"`),
    ...seed.projects.filter((project) => project.owner === person).map((project) => `owns project "${project.name}"`),
  ];
  return facts.filter(Boolean).join(" · ") || "nothing assigned";
}

function count(n: number, one: string, many = one, suffix = ""): string {
  return n === 0 ? "" : `${n} ${n === 1 ? one : many}${suffix}`;
}

function canDecide(seed: OrgSeed, person: Person): boolean {
  const role = seed.members.find((member) => member.person === person)?.role;
  return role === "leader" || role === "admin";
}

function contents(seed: OrgSeed): string[] {
  const name = (person: Person) => PEOPLE[person].name;
  const tally = <T extends string>(values: T[], labels: Record<T, string>) =>
    Object.entries(
      values.reduce<Record<string, number>>((acc, value) => ({ ...acc, [labels[value]]: (acc[labels[value]] ?? 0) + 1 }), {}),
    )
      .map(([label, n]) => `${n} ${label.toLowerCase()}`)
      .join(", ");
  const open = seed.tasks.filter((task) => !CLOSED_STATUSES.includes(task.status));
  const comments = seed.tasks.reduce((sum, task) => sum + (task.comments?.length ?? 0), 0);
  const links = seed.tasks.reduce((sum, task) => sum + (task.links?.length ?? 0), 0);
  const converted = seed.requests.find((request) => request.status === "converted");
  return [
    `**${seed.org.name}** (slug \`${seed.org.slug}\`, ${seed.org.timezone}): ${seed.members.map((member) => `${name(member.person)} (${member.role})`).join(", ")}.`,
    "",
    ...seed.goals.map((goal) => `- Goal **${goal.title}** (${goal.status}), owner ${name(goal.owner)}.`),
    ...seed.projects.map(
      (project) =>
        `- Project **${project.name}** (${project.status}), owner ${name(project.owner)}${project.goal ? `, under "${seed.goals.find((goal) => goal.key === project.goal)?.title}"` : ""}.`,
    ),
    `- ${seed.tasks.length} tasks: ${tally(
      seed.tasks.map((task) => task.status),
      TASK_STATUS_LABELS,
    )}. ${open.filter((task) => task.dueInDays !== null && task.dueInDays < 0).length} overdue, ${open.filter((task) => task.assignee === null).length} unassigned; ${comments} comments and ${links} evidence links.`,
    `- ${seed.requests.length} request${seed.requests.length === 1 ? "" : "s"}: ${tally(
      seed.requests.map((request) => request.status),
      REQUEST_STATUS_LABELS,
    )}.${converted ? ` "${converted.title}" (from ${name(converted.requester)}) was converted into a task that links back to it.` : ""}`,
    seed.notifications.length > 0
      ? `- ${seed.notifications.length} notifications (${seed.notifications.filter((notice) => !notice.read).length} unread) for ${[...new Set(seed.notifications.map((notice) => name(notice.person)))].join(", ")}.`
      : "- No notifications.",
  ];
}

/** docs/TEST-ACCOUNTS.md: the accounts and data as seeded, so nobody has to read this script to know what exists. */
function writeAccountsDoc(): void {
  const seedFor = (persona: (typeof TEST_PERSONAS)[TestPersona]) => (persona.org === "demo" ? DEMO : OTHER);
  const roster = (Object.entries(TEST_PERSONAS) as [TestPersona, (typeof TEST_PERSONAS)[TestPersona]][]).map(
    ([key, persona]) => `| \`${key}\` | \`${persona.email}\` | ${persona.name} | ${seedFor(persona).org.name}: ${ORG_ROLE_LABELS[persona.role].toLowerCase()} |`,
  );
  const starts = (Object.entries(TEST_PERSONAS) as [TestPersona, (typeof TEST_PERSONAS)[TestPersona]][]).map(
    ([key, persona]) => `| \`${key}\` | ${startsWith(seedFor(persona), key)} |`,
  );
  const lines = [
    "# Test accounts",
    "",
    "> **Generated by `npm run test:seed`. Do not edit by hand.** Change `lib/test-mode.ts` / `scripts/seed-data.ts` and run it again.",
    "",
    "Made-up accounts for test mode (`lib/test-mode.ts`) on the reserved `.test` domain. No email is ever sent to them, and the",
    "scripts only ever reset or delete workspaces whose every member is a `.test` account.",
    "",
    "## Sign in",
    "",
    `Dev server only: \`GET /api/test-login?as=<persona>&secret=<TEST_MODE_SECRET>&to=${TEST_HOME}\`. The secret lives in \`.env.local\`;`,
    "never print it. `scripts/test-browser.mjs` and the walkthroughs in `scripts/test-walkthrough/` sign in this way for you.",
    "",
    "| `as=` | Email | Name | Workspace: role |",
    "| --- | --- | --- | --- |",
    ...roster,
    "",
    `Also seeded: \`${PEOPLE.casey.email}\` (${PEOPLE.casey.name}), a member of ${OTHER.org.name} who is not a sign-in persona.`,
    "",
    "## What each persona starts with",
    "",
    "| `as=` | Waiting for them after a seed |",
    "| --- | --- |",
    ...starts,
    "",
    "## What the workspaces contain",
    "",
    ...contents(DEMO),
    "- Dates are relative to the moment of seeding, so re-seed (or `npm run test:tidy`) to keep the dashboards current.",
    "",
    ...contents(OTHER),
    "- Used to prove cross-workspace isolation: nothing in it refers to anything in the demo workspace.",
    "",
    "## Commands",
    "",
    "```bash",
    "npm run test:seed     # create / reset the personas and both workspaces (and this file)",
    "npm run test:status   # who exists, their workspaces, row counts",
    "npm run test:tidy     # put both workspaces back to the seeded state; remove workspaces a test run created",
    "npm run test:clean    # delete both workspaces and every .test account",
    "npm run test:walk     # run every scripted walkthrough in scripts/test-walkthrough/",
    "```",
    "",
  ];
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/TEST-ACCOUNTS.md", lines.join("\n"));
  console.log("wrote docs/TEST-ACCOUNTS.md");
}

// --- command line --------------------------------------------------------------------------------------

const commands = { seed, status, tidy, clean } as const;
const command = process.argv[2] as keyof typeof commands | undefined;

/** One line a person can act on: a refusal as written, a database error with its cause (not the whole SQL). */
function explain(error: unknown): string {
  if (error instanceof Refusal) return `Refused, nothing was changed: ${error.message}`;
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
  return `Failed, nothing was changed: ${cause ?? (error instanceof Error ? error.message : String(error))}`;
}

if (command === undefined || !Object.hasOwn(commands, command)) {
  console.error("Usage: npx tsx scripts/test-accounts.ts <seed|status|tidy|clean>");
  process.exitCode = 1;
  void pool.end();
} else {
  commands[command]()
    .catch((error: unknown) => {
      console.error(explain(error));
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
