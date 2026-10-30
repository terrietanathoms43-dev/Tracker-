import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type Tx } from "@/db";
import { goals, projects, requests, taskActivity, taskLinks, tasks, users } from "@/db/schema";
import { CLOSED_STATUSES, DUE_SOON_DAYS, RECENTLY_FINISHED_DAYS, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { assignmentOf } from "@/lib/dal/assignments";
import { listWorkers } from "@/lib/dal/orgs";
import { canDeleteTask, isStakeholder, type TaskScope, type Viewer } from "@/lib/permissions";
import { BOARD_STATUSES, toBoardColumns, type BoardColumns } from "@/lib/tasks/board";
import type { TaskFilters, TaskSort } from "@/lib/tasks/filters";
import { FEED_KINDS, phraseFeed, type FeedKind } from "@/lib/tasks/history";
import { groupMyWork, resumeOrder, type MyWorkGroups, type MyWorkRow } from "@/lib/tasks/my-work";
import type {
  ActivityFeedItem,
  EvidenceLink,
  GoalOption,
  Person,
  PersonOption,
  TaskCounts,
  TaskDetail,
  TaskFormOptions,
  TaskListItem,
  TaskPage,
  TaskProgress,
  WorkloadRow,
} from "@/lib/tasks/types";
import { dayKey } from "@/lib/time";

// Every read of tasks, for every screen: lists, the board, My Work, the task page, and the counts, progress,
// workload and feeds that Home, Members, Projects, Goals and Reports build on. Each function takes the Viewer and
// filters by its workspace in SQL; stakeholders only ever see the tasks made from their own requests.
// Assignment is a set of people (task_assignees): every row carries it as JSON, so no list joins people.

const CLOSED = [...CLOSED_STATUSES];
const creatorUser = alias(users, "creator_user");
const approverUser = alias(users, "approver_user");
const parentGoal = alias(goals, "parent_goal");

/** The tenancy boundary for tasks: this workspace, and for stakeholders only tasks from their own requests. */
function visibility(viewer: Viewer): SQL {
  const inOrg = eq(tasks.orgId, viewer.orgId);
  if (!isStakeholder(viewer)) return inOrg;
  return and(
    inOrg,
    sql`${tasks.requestId} in (select ${requests.id} from ${requests} where ${requests.requesterId} = ${viewer.userId} and ${requests.orgId} = ${viewer.orgId})`,
  )!;
}

const todayFor = (viewer: Viewer) => dayKey(new Date(), viewer.timezone);
const isOpen = notInArray(tasks.status, CLOSED);
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

/** The goal itself and its sub-goals (one level, docs/PLAN.md 2026-10-30 log): what "under this goal" means. */
const goalFamily = (viewer: Viewer, goalId: string) =>
  sql`(select ${goals.id} from ${goals} where ${goals.orgId} = ${viewer.orgId} and (${goals.id} = ${goalId} or ${goals.parentGoalId} = ${goalId}))`;

/** Tasks serving a goal: linked to it or a sub-goal of it directly, or through a project under either. */
function inGoal(viewer: Viewer, goalId: string): SQL {
  const family = goalFamily(viewer, goalId);
  return or(
    sql`${tasks.goalId} in ${family}`,
    sql`${tasks.projectId} in (select ${projects.id} from ${projects} where ${projects.goalId} in ${family} and ${projects.orgId} = ${viewer.orgId})`,
  )!;
}

// --- assignment and comments, in SQL --------------------------------------------------------------------------

/** The people on the task, as JSON, alphabetically (reports select it too). */
export const assigneesJson = sql<Person[]>`coalesce((select json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'image', u.image) order by u.name nulls last, u.email) from task_assignees ta join users u on u.id = ta.user_id where ta.task_id = ${tasks.id}), '[]'::json)`;

const assignedTo = (userId: string) => sql`exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id} and ta.user_id = ${userId})`;
/** Nobody. */
const unassigned = sql`not exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id})`;

/** Comments nobody has resolved: while there are any, the task can't be completed (lib/tasks/transitions.ts). */
const openCommentsSql = sql<number>`(select count(*)::int from task_updates u where u.task_id = ${tasks.id} and u.kind = 'comment' and u.resolved_at is null)`;

// --- list rows -----------------------------------------------------------------------------------------------

const listColumns = {
  id: tasks.id,
  title: tasks.title,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  nextAction: tasks.nextAction,
  updatedAt: tasks.updatedAt,
  goalId: tasks.goalId,
  projectId: projects.id,
  projectName: projects.name,
  assignees: assigneesJson,
};

type ListRow = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskListItem["priority"];
  dueDate: string | null;
  nextAction: string | null;
  updatedAt: Date;
  goalId: string | null;
  projectId: string | null;
  projectName: string | null;
  assignees: Person[];
};

function toListItem(row: ListRow, viewer: Viewer): TaskListItem {
  return {
    id: row.id,
    goalId: row.goalId,
    canDelete: canDeleteTask(viewer),
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    nextAction: row.nextAction,
    updatedAt: row.updatedAt.toISOString(),
    project: row.projectId && row.projectName ? { id: row.projectId, name: row.projectName } : null,
    assignees: row.assignees,
  };
}

/** `select <list row> from tasks` with the join every row needs (its project); assignees come as JSON. */
function selectList() {
  return db.select(listColumns).from(tasks).leftJoin(projects, eq(projects.id, tasks.projectId));
}

// Sort keys are written against a table alias so the keyset cursor can compare the same expressions on the
// cursor's own row ("tasks" for the list, "cur" for the cursor). Every key sorts ascending; id breaks ties.
function sortKeys(sort: TaskSort, table: "tasks" | "cur", today: string): SQL[] {
  const col = (name: string) => sql.raw(`"${table}"."${name}"`);
  const open = sql`${col("status")} not in ('completed', 'rejected')`;
  const overdue = sql`(case when ${col("due_date")} < ${today}::date and ${open} then 0 else 1 end)`;
  const due = sql`coalesce(${col("due_date")}, '9999-12-31'::date)`;
  const priority = sql`(case ${col("priority")} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end)`;
  const rank = sql`(-${col("sort_rank")})`;
  const updated = sql`(-extract(epoch from ${col("updated_at")}))`;
  const created = sql`(-extract(epoch from ${col("created_at")}))`;
  switch (sort) {
    case "due":
      return [due, priority, updated];
    case "priority":
      return [priority, due, updated];
    case "updated":
      return [updated];
    case "created":
      return [created];
    default:
      return [overdue, due, priority, rank, updated];
  }
}

const orderBy = (sort: TaskSort, today: string) => [...sortKeys(sort, "tasks", today).map((key) => sql`${key} asc`), asc(tasks.id)];

/** The conditions every filter shares between the list and the board (status is handled by each). */
function filterConditions(viewer: Viewer, filters: TaskFilters, today: string): SQL[] {
  const where: SQL[] = [visibility(viewer)];
  if (filters.q) where.push(ilike(tasks.title, `%${escapeLike(filters.q)}%`));
  if (filters.assignee === "me") where.push(assignedTo(viewer.userId));
  else if (filters.assignee === "none") where.push(unassigned);
  else if (filters.assignee) where.push(assignedTo(filters.assignee));
  if (filters.priority) where.push(eq(tasks.priority, filters.priority));
  if (filters.project === "none") where.push(isNull(tasks.projectId));
  else if (filters.project) where.push(eq(tasks.projectId, filters.project));
  if (filters.goal === "none") where.push(isNull(tasks.goalId));
  else if (filters.goal) where.push(inGoal(viewer, filters.goal));
  if (filters.due === "overdue") where.push(sql`${tasks.dueDate} < ${today}::date`, isOpen);
  if (filters.due === "week") where.push(sql`${tasks.dueDate} between ${today}::date and ${today}::date + 6`);
  if (filters.due === "none") where.push(isNull(tasks.dueDate));
  return where;
}

const isNull = (column: AnyPgColumn) => sql`${column} is null`;

export const PAGE_SIZE = 50;

/**
 * The task list: filters from the URL (lib/tasks/filters.ts), one of five sorts, `limit` at a time (50) with a
 * keyset cursor (the id of the last row shown), so "Load more" never skips or repeats a row.
 */
export async function listTasks(viewer: Viewer, filters: TaskFilters, options: { today: string; cursor?: string | null; limit?: number }): Promise<TaskPage> {
  const limit = options.limit ?? PAGE_SIZE;
  const { today } = options;
  const where = filterConditions(viewer, filters, today);
  if (filters.status.length > 0) where.push(inArray(tasks.status, filters.status));
  else if (!filters.closed) where.push(isOpen);

  if (options.cursor) {
    const keys = sortKeys(filters.sort, "tasks", today);
    const cursorKeys = sortKeys(filters.sort, "cur", today);
    where.push(
      sql`(${sql.join([...keys, sql`${tasks.id}`], sql`, `)}) > (select ${sql.join([...cursorKeys, sql.raw(`"cur"."id"`)], sql`, `)} from "tasks" "cur" where "cur"."id" = ${options.cursor} and "cur"."org_id" = ${viewer.orgId})`,
    );
  }

  const rows = await selectList()
    .where(and(...where))
    .orderBy(...orderBy(filters.sort, today))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map((row) => toListItem(row, viewer));
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}

/**
 * The board (`/home?view=board`): the same filters as the list, split into five status columns. Completed shows
 * only the last RECENTLY_FINISHED_DAYS days; a status filter narrows the board to those columns.
 */
export async function boardTasks(viewer: Viewer, filters: TaskFilters, options: { today: string }): Promise<BoardColumns> {
  const statuses = filters.status.length > 0 ? BOARD_STATUSES.filter((status) => filters.status.includes(status)) : [...BOARD_STATUSES];
  if (statuses.length === 0) return toBoardColumns([]);
  const where = filterConditions(viewer, filters, options.today);
  where.push(
    inArray(tasks.status, statuses),
    sql`(${tasks.status} <> 'completed' or ${tasks.completedAt} > now() - make_interval(days => ${RECENTLY_FINISHED_DAYS}))`,
  );
  const rows = await selectList()
    .where(and(...where))
    .orderBy(...orderBy(filters.sort, options.today))
    .limit(500);
  return toBoardColumns(rows.map((row) => toListItem(row, viewer)));
}

/** Title search for the command palette: open tasks first, then the most recently touched. */
export async function searchTasks(viewer: Viewer, q: string): Promise<TaskListItem[]> {
  const term = q.trim().slice(0, 100);
  if (term === "") return [];
  const rows = await selectList()
    .where(and(visibility(viewer), ilike(tasks.title, `%${escapeLike(term)}%`)))
    .orderBy(sql`(${tasks.status} in ('completed', 'rejected'))`, desc(tasks.updatedAt))
    .limit(8);
  return rows.map((row) => toListItem(row, viewer));
}

// --- attention, My Work --------------------------------------------------------------------------------------

const ATTENTION_RANK: Record<string, number> = { Overdue: 0, Blocked: 1, "Your approval": 2, "Awaiting approval": 3, Unassigned: 4, "Due soon": 5 };

/**
 * Open work in the workspace that needs someone's hand (Home and Members): overdue, blocked, awaiting approval,
 * unassigned, or due within DUE_SOON_DAYS. Each item carries one `reason`; the most pressing wins, then the
 * nearest due date.
 */
export async function attentionTasks(viewer: Viewer, today: string, limit = 50): Promise<TaskListItem[]> {
  const rows = await db
    .select({ ...listColumns, approverId: tasks.approverId })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        visibility(viewer),
        isOpen,
        or(eq(tasks.status, "blocked"), eq(tasks.status, "awaiting_approval"), sql`${tasks.dueDate} <= ${today}::date + ${DUE_SOON_DAYS}::int`, unassigned),
      ),
    );
  const items = rows.map((row) => {
    const nobody = row.assignees.length === 0;
    const reason =
      row.dueDate !== null && row.dueDate < today
        ? "Overdue"
        : row.status === "blocked"
          ? "Blocked"
          : row.status === "awaiting_approval"
            ? row.approverId === viewer.userId
              ? "Your approval"
              : "Awaiting approval"
            : nobody
              ? "Unassigned"
              : "Due soon";
    return { ...toListItem(row, viewer), reason };
  });
  items.sort((a, b) => ATTENTION_RANK[a.reason] - ATTENTION_RANK[b.reason] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return items.slice(0, limit);
}

export type ApprovalStagingTask = {
  id: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  updatedAt: string;
  latestProgress: string | null;
  completionSummary: string | null;
  nextAction: string | null;
  approverId: string | null;
  project: { id: string; name: string } | null;
  assignees: Person[];
  evidence: { url: string; label: string | null }[];
  /** Open comments: approving is refused until they are resolved. */
  openComments: number;
};

/**
 * Tasks waiting for approval across the workspace, along with their latest progress,
 * completion summaries, and evidence links so supervisors have the facts before approving.
 */
export async function approvalStagingTasks(viewer: Viewer): Promise<ApprovalStagingTask[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      updatedAt: tasks.updatedAt,
      latestProgress: tasks.latestProgress,
      completionSummary: tasks.completionSummary,
      nextAction: tasks.nextAction,
      approverId: tasks.approverId,
      projectId: projects.id,
      projectName: projects.name,
      people: assigneesJson,
      openComments: openCommentsSql,
      evidence: sql<{ url: string; label: string | null }[]>`coalesce((select json_agg(json_build_object('url', l.url, 'label', l.label) order by l.created_at) from task_links l where l.task_id = ${tasks.id}), '[]'::json)`,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.orgId, viewer.orgId), eq(tasks.status, "awaiting_approval")))
    .orderBy(asc(tasks.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    priority: row.priority,
    dueDate: row.dueDate,
    updatedAt: row.updatedAt.toISOString(),
    latestProgress: row.latestProgress,
    completionSummary: row.completionSummary,
    nextAction: row.nextAction,
    approverId: row.approverId,
    project: row.projectId && row.projectName ? { id: row.projectId, name: row.projectName } : null,
    assignees: row.people,
    evidence: row.evidence,
    openComments: row.openComments,
  }));
}

/**
 * Everything My Work groups, in one query: my open work and my recently finished work, and approvals I owe.
 */
export async function myWorkRows(viewer: Viewer): Promise<MyWorkRow[]> {
  const me = viewer.userId;
  const rows = await db
    .select({
      ...listColumns,
      mine: sql<boolean>`${assignedTo(me)}`,
      approverId: tasks.approverId,
      sortRank: tasks.sortRank,
      completedAt: tasks.completedAt,
      lastStatusKind: sql<string | null>`(select a.kind::text from task_activity a where a.task_id = ${tasks.id} and a.kind in ('sent_back', 'approval_requested', 'approved', 'status_changed', 'blocked', 'unblocked', 'completed', 'reopened', 'rejected') order by a.created_at desc limit 1)`,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        visibility(viewer),
        or(
          and(assignedTo(me), or(isOpen, sql`(${tasks.status} = 'completed' and ${tasks.completedAt} > now() - make_interval(days => ${RECENTLY_FINISHED_DAYS}))`)),
          and(eq(tasks.approverId, me), eq(tasks.status, "awaiting_approval")),
        ),
      ),
    );
  return rows.map((row) => ({
    item: toListItem(row, viewer),
    approverId: row.approverId,
    mine: row.mine,
    sortRank: row.sortRank,
    completedAt: row.completedAt,
    sentBack: row.status === "in_progress" && row.lastStatusKind === "sent_back",
  }));
}

/** My Work's four groups (Needs attention · Continue working · Waiting on others · Recently finished). */
export async function myWorkGroups(viewer: Viewer, today: string): Promise<MyWorkGroups> {
  return groupMyWork(await myWorkRows(viewer), viewer.userId, today);
}

/**
 * "Pick up where you left off": the viewer's work they can act on now, in My Work order (Needs attention with
 * its reasons, then Continue working). Waiting and finished work is left out. Home shows the first five.
 */
export async function myWorkTasks(viewer: Viewer): Promise<TaskListItem[]> {
  return resumeOrder(await myWorkGroups(viewer, todayFor(viewer)));
}

// --- projects, goals, counts, workload ---------------------------------------------------------------------

const groupedOrder = (today: string) => [sql`(${tasks.status} in ('completed', 'rejected'))`, ...orderBy("smart", today)];

/** Every task in a project (open first, in the smart order), for the project page to group by status. */
export async function tasksForProject(viewer: Viewer, projectId: string): Promise<TaskListItem[]> {
  const rows = await selectList()
    .where(and(visibility(viewer), eq(tasks.projectId, projectId)))
    .orderBy(...groupedOrder(todayFor(viewer)))
    .limit(500);
  return rows.map((row) => toListItem(row, viewer));
}

/** Every task serving a goal: linked to it or one of its sub-goals directly, or through a project under either (open first). */
export async function tasksForGoal(viewer: Viewer, goalId: string): Promise<TaskListItem[]> {
  const rows = await selectList()
    .where(and(visibility(viewer), inGoal(viewer, goalId)))
    .orderBy(...groupedOrder(todayFor(viewer)))
    .limit(500);
  return rows.map((row) => toListItem(row, viewer));
}

type ProgressRow = { key: string; taskId: string; status: TaskStatus; dueDate: string | null };

/** Counts each (key, task) pair once: a task linked to a goal directly and through its project counts once. */
function tallyProgress(rows: ProgressRow[], keys: string[], today: string): Map<string, TaskProgress> {
  const out = new Map<string, TaskProgress>(keys.map((key) => [key, { completed: 0, total: 0, blocked: 0, overdue: 0 }]));
  const seen = new Set<string>();
  for (const row of rows) {
    const pair = `${row.key}:${row.taskId}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const tally = out.get(row.key);
    if (!tally) continue;
    tally.total += 1;
    if (row.status === "completed") tally.completed += 1;
    if (row.status === "blocked") tally.blocked += 1;
    if (row.status !== "completed" && row.dueDate !== null && row.dueDate < today) tally.overdue += 1;
  }
  return out;
}

/**
 * Progress per goal (completed / total, plus blocked and overdue), counting tasks linked directly, through the
 * goal's projects, and through its sub-goals (and their projects). Rejected tasks are left out of the total: they
 * will never be completed. Every id asked for gets an entry, zeros included.
 */
export async function progressForGoals(viewer: Viewer, goalIds: string[]): Promise<Map<string, TaskProgress>> {
  if (goalIds.length === 0) return new Map();
  // A sub-goal's tasks count for the sub-goal and roll up into its parent.
  const children = await db
    .select({ id: goals.id, parentGoalId: goals.parentGoalId })
    .from(goals)
    .where(and(eq(goals.orgId, viewer.orgId), inArray(goals.parentGoalId, goalIds)));
  const parentOf = new Map(children.map((child) => [child.id, child.parentGoalId!]));
  const allIds = [...new Set([...goalIds, ...parentOf.keys()])];
  const base = { taskId: tasks.id, status: tasks.status, dueDate: tasks.dueDate };
  const [direct, viaProject] = await Promise.all([
    db
      .select({ ...base, key: tasks.goalId })
      .from(tasks)
      .where(and(visibility(viewer), ne(tasks.status, "rejected"), inArray(tasks.goalId, allIds))),
    db
      .select({ ...base, key: projects.goalId })
      .from(tasks)
      .innerJoin(projects, and(eq(projects.id, tasks.projectId), eq(projects.orgId, viewer.orgId)))
      .where(and(visibility(viewer), ne(tasks.status, "rejected"), inArray(projects.goalId, allIds))),
  ]);
  const rows: ProgressRow[] = [];
  for (const row of [...direct, ...viaProject]) {
    if (row.key === null) continue;
    if (goalIds.includes(row.key)) rows.push({ ...row, key: row.key });
    const parent = parentOf.get(row.key);
    if (parent !== undefined && goalIds.includes(parent)) rows.push({ ...row, key: parent });
  }
  return tallyProgress(rows, goalIds, todayFor(viewer));
}

/** Progress per project, the same shape as progressForGoals. */
export async function progressForProjects(viewer: Viewer, projectIds: string[]): Promise<Map<string, TaskProgress>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ key: tasks.projectId, taskId: tasks.id, status: tasks.status, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(visibility(viewer), ne(tasks.status, "rejected"), inArray(tasks.projectId, projectIds)));
  return tallyProgress(
    rows.filter((row): row is ProgressRow => row.key !== null),
    projectIds,
    todayFor(viewer),
  );
}

const countIf = (condition: SQL) => sql<number>`(count(*) filter (where ${condition}))::int`;

/**
 * The count tiles on Home: open work, work completed since `since`, and the three kinds of trouble.
 * Facts, never scores.
 */
export async function taskCounts(viewer: Viewer, options: { today: string; since: Date }): Promise<TaskCounts> {
  const [row] = await db
    .select({
      active: countIf(isOpen),
      completed: countIf(and(eq(tasks.status, "completed"), gte(tasks.completedAt, options.since))!),
      overdue: countIf(and(isOpen, sql`${tasks.dueDate} < ${options.today}::date`)!),
      blocked: countIf(eq(tasks.status, "blocked")),
      awaiting: countIf(eq(tasks.status, "awaiting_approval")),
    })
    .from(tasks)
    .where(visibility(viewer));
  return row ?? { active: 0, completed: 0, overdue: 0, blocked: 0, awaiting: 0 };
}

/**
 * Open work per person (Home's Workload): every worker, even with nothing assigned, then an "Unassigned" row
 * (person null) when open work has nobody on it. A task with three people on it is in three rows.
 */
export async function workload(viewer: Viewer): Promise<WorkloadRow[]> {
  if (isStakeholder(viewer)) return [];
  const today = todayFor(viewer);
  const [workers, rows] = await Promise.all([
    listWorkers(viewer),
    selectList()
      .where(and(visibility(viewer), isOpen))
      .orderBy(...orderBy("smart", today)),
  ]);
  const byPerson = new Map<string | null, TaskListItem[]>();
  const people = new Map<string, Person>();
  for (const row of rows) {
    const item = toListItem(row, viewer);
    if (item.assignees.length === 0) byPerson.set(null, [...(byPerson.get(null) ?? []), item]);
    for (const person of item.assignees) {
      people.set(person.id, person);
      byPerson.set(person.id, [...(byPerson.get(person.id) ?? []), item]);
    }
  }
  const summarise = (person: Person | null, active: TaskListItem[]): WorkloadRow => ({
    person,
    active,
    blocked: active.filter((item) => item.status === "blocked").length,
    overdue: active.filter((item) => item.dueDate !== null && item.dueDate < today).length,
  });
  const out = workers.map((worker) => summarise({ id: worker.userId, name: worker.name, email: worker.email, image: worker.image }, byPerson.get(worker.userId) ?? []));
  // Someone who left the workspace can still hold open work; they are listed after the members.
  for (const [key, active] of byPerson) {
    if (key !== null && !workers.some((worker) => worker.userId === key)) out.push(summarise(people.get(key) ?? null, active));
  }
  const nobody = byPerson.get(null);
  if (nobody) out.push(summarise(null, nobody));
  return out;
}

/**
 * The important changes in the workspace, newest first (Home and Members feeds): completed, blocked, unblocked,
 * approved, sent back, rejected, due date changed, reopened. Edits and progress updates are left out on purpose.
 */
export async function recentActivity(viewer: Viewer, limit: number, since?: Date): Promise<ActivityFeedItem[]> {
  const actor = alias(users, "actor_user");
  const where: SQL[] = [eq(taskActivity.orgId, viewer.orgId), visibility(viewer), inArray(taskActivity.kind, [...FEED_KINDS])];
  if (since) where.push(gte(taskActivity.createdAt, since));
  const rows = await db
    .select({
      id: taskActivity.id,
      kind: taskActivity.kind,
      note: taskActivity.note,
      before: taskActivity.before,
      after: taskActivity.after,
      createdAt: taskActivity.createdAt,
      taskId: tasks.id,
      taskTitle: tasks.title,
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      actorImage: actor.image,
    })
    .from(taskActivity)
    .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
    .innerJoin(actor, eq(actor.id, taskActivity.actorId))
    .where(and(...where))
    .orderBy(desc(taskActivity.createdAt), desc(taskActivity.id))
    .limit(limit * 2);
  const today = todayFor(viewer);
  // An approval writes "approved" and "completed" together; the feed says it once.
  const approvals = rows.filter((row) => row.kind === "approved");
  const isApproval = (row: (typeof rows)[number]) =>
    row.kind === "completed" && approvals.some((approval) => approval.taskId === row.taskId && Math.abs(approval.createdAt.getTime() - row.createdAt.getTime()) < 1000);
  const kept = rows.filter((row) => !isApproval(row)).slice(0, limit);
  return kept.map((row) =>
    phraseFeed(
      {
        ...row,
        kind: row.kind as FeedKind,
        actor: { id: row.actorId, name: row.actorName, email: row.actorEmail, image: row.actorImage },
      },
      today,
    ),
  );
}

// --- one task ---------------------------------------------------------------------------------------------------

type PersonColumns = { id: AnyPgColumn; name: AnyPgColumn; email: AnyPgColumn; image: AnyPgColumn };
const personJson = (table: PersonColumns) => sql`json_build_object('id', ${table.id}, 'name', ${table.name}, 'email', ${table.email}, 'image', ${table.image})`;

const scopeOf = (task: { orgId: string; createdBy: string; approverId: string | null }, assignees: Person[] | string[], requesterId: string | null): TaskScope => ({
  orgId: task.orgId,
  assigneeIds: assignees.map((each) => (typeof each === "string" ? each : each.id)),
  createdBy: task.createdBy,
  approverId: task.approverId,
  requesterId,
});

/** One task with everything its page shows, plus the scope its permission checks need (null when not found). */
export async function getTask(viewer: Viewer, id: string): Promise<{ detail: TaskDetail; scope: TaskScope } | null> {
  const [row] = await db
    .select({
      task: tasks,
      projectName: projects.name,
      goalTitle: goals.title,
      requestTitle: requests.title,
      requesterId: requests.requesterId,
      assignees: assigneesJson,
      openComments: openCommentsSql,
      approver: sql<Person | null>`case when ${approverUser.id} is null then null else ${personJson(approverUser)} end`,
      creator: sql<Person>`${personJson(creatorUser)}`,
      lastUpdate: sql<{ author: Person; at: string } | null>`(select json_build_object('at', u.created_at, 'author', json_build_object('id', au.id, 'name', au.name, 'email', au.email, 'image', au.image)) from task_updates u join users au on au.id = u.author_id where u.task_id = ${tasks.id} and u.kind = 'progress' order by u.created_at desc limit 1)`,
    })
    .from(tasks)
    .innerJoin(creatorUser, eq(creatorUser.id, tasks.createdBy))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(goals, eq(goals.id, tasks.goalId))
    .leftJoin(requests, eq(requests.id, tasks.requestId))
    .leftJoin(approverUser, eq(approverUser.id, tasks.approverId))
    .where(and(eq(tasks.id, id), eq(tasks.orgId, viewer.orgId)));
  if (!row) return null;
  const t = row.task;
  const detail: TaskDetail = {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    project: t.projectId && row.projectName ? { id: t.projectId, name: row.projectName } : null,
    goal: t.goalId && row.goalTitle ? { id: t.goalId, title: row.goalTitle } : null,
    request: t.requestId && row.requestTitle ? { id: t.requestId, title: row.requestTitle } : null,
    assignees: row.assignees,
    approver: row.approver,
    creator: row.creator,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    startedAt: t.startedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    blockedReason: t.blockedReason,
    blockedBy: t.blockedBy,
    rejectionReason: t.rejectionReason,
    latestProgress: t.latestProgress,
    nextAction: t.nextAction,
    completionSummary: t.completionSummary,
    openComments: row.openComments,
    lastUpdate: row.lastUpdate ? { author: row.lastUpdate.author, at: new Date(row.lastUpdate.at).toISOString() } : null,
  };
  return { detail, scope: scopeOf(t, row.assignees, row.requesterId) };
}

/** A task's basics and permission scope: for read actions and the Update progress form. */
export async function getTaskBasics(viewer: Viewer, id: string) {
  const [row] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      createdBy: tasks.createdBy,
      approverId: tasks.approverId,
      nextAction: tasks.nextAction,
      blockedReason: tasks.blockedReason,
      blockedBy: tasks.blockedBy,
      requesterId: requests.requesterId,
      assignees: assigneesJson,
      openComments: openCommentsSql,
    })
    .from(tasks)
    .leftJoin(requests, eq(requests.id, tasks.requestId))
    .where(and(eq(tasks.id, id), eq(tasks.orgId, viewer.orgId)));
  if (!row) return null;
  const { assignees, ...basics } = row;
  return {
    ...basics,
    assigneeIds: assignees.map((person) => person.id),
    scope: scopeOf({ orgId: viewer.orgId, createdBy: row.createdBy, approverId: row.approverId }, assignees, row.requesterId),
  };
}

/** A task's evidence links, oldest first. */
export async function listLinks(viewer: Viewer, taskId: string): Promise<EvidenceLink[]> {
  return db
    .select({ id: taskLinks.id, url: taskLinks.url, label: taskLinks.label, addedBy: taskLinks.addedBy })
    .from(taskLinks)
    .innerJoin(tasks, eq(tasks.id, taskLinks.taskId))
    .where(and(eq(taskLinks.taskId, taskId), eq(tasks.orgId, viewer.orgId)))
    .orderBy(asc(taskLinks.createdAt));
}

/**
 * The task row an action works on, locked (`select … for update`) for the rest of the transaction, with its
 * assignment, its open-comment count (the transition rules need it) and the scope its permission checks need.
 * Null when the id is unknown or belongs to another workspace.
 */
export async function lockTask(tx: Tx, orgId: string, id: string) {
  const [row] = await tx
    .select({ task: tasks, requesterId: requests.requesterId, openComments: openCommentsSql })
    .from(tasks)
    .leftJoin(requests, eq(requests.id, tasks.requestId))
    .where(and(eq(tasks.id, id), eq(tasks.orgId, orgId)))
    .for("update", { of: tasks });
  if (!row) return null;
  const t = { ...row.task, openComments: row.openComments };
  const assignment = await assignmentOf(tx, t.id);
  return { task: t, assignment, scope: scopeOf(t, assignment, row.requesterId) };
}

// --- pickers --------------------------------------------------------------------------------------------------------

/** The workers who can be assigned, take over or approve a task, with their role (for default approvers and labels). */
export async function taskPeople(viewer: Viewer): Promise<PersonOption[]> {
  const workers = await listWorkers(viewer);
  return workers.map((worker) => ({ id: worker.userId, name: worker.name, email: worker.email, image: worker.image, role: worker.role }));
}

/** A sub-goal is offered as "Parent › Sub-goal", so two goals with similar names stay apart in a short list. */
export const goalOptionLabel = (title: string, parentTitle: string | null): string => (parentTitle ? `${parentTitle} › ${title}` : title);

/** The projects and goals new work can join: the active ones, by name (sub-goals right after their parent). */
export async function activePlanning(viewer: Viewer): Promise<Pick<TaskFormOptions, "projects" | "goals">> {
  const [projectRows, goalRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.orgId, viewer.orgId), eq(projects.status, "active")))
      .orderBy(asc(projects.name)),
    db
      .select({ id: goals.id, title: goals.title, parentTitle: parentGoal.title })
      .from(goals)
      .leftJoin(parentGoal, eq(parentGoal.id, goals.parentGoalId))
      .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active")))
      .orderBy(asc(sql`coalesce(${parentGoal.title}, ${goals.title})`), sql`${goals.parentGoalId} is not null`, asc(goals.title)),
  ]);
  const goalOptions: GoalOption[] = goalRows.map((row) => ({ id: row.id, title: goalOptionLabel(row.title, row.parentTitle) }));
  return { projects: projectRows, goals: goalOptions };
}

/** What the New task form offers: the workers, the active projects and the active goals. */
export async function taskFormOptions(viewer: Viewer): Promise<TaskFormOptions> {
  const [people, planning] = await Promise.all([taskPeople(viewer), activePlanning(viewer)]);
  return { viewerId: viewer.userId, people: people.map(({ id, name, email, image }) => ({ id, name, email, image })), ...planning };
}
