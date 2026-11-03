import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type Tx } from "@/db";
import { goals, projects, taskActivity, taskLinks, tasks, users } from "@/db/schema";
import { CLOSED_STATUSES, DUE_SOON_DAYS, RECENTLY_FINISHED_DAYS, type ProposalStatus, type TaskPriority, type TaskStatus } from "@/lib/constants";
import { assignmentOf } from "@/lib/dal/assignments";
import { listWorkers } from "@/lib/dal/orgs";
import { canDeleteTask, isStakeholder, type TaskScope, type Viewer } from "@/lib/permissions";
import { describeRecurrence, type Recurrence } from "@/lib/recurrence";
import { BOARD_STATUSES, toBoardColumns, type BoardColumns } from "@/lib/tasks/board";
import type { TaskFilters, TaskSort } from "@/lib/tasks/filters";
import { FEED_KINDS, phraseFeed, type FeedKind } from "@/lib/tasks/history";
import { groupMyWork, resumeOrder, type MyWorkGroups, type MyWorkRow } from "@/lib/tasks/my-work";
import type {
  ActivityFeedItem,
  ApprovalStepView,
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
// filters by its workspace in SQL. Lists show live work only: a proposal still waiting for sign-off (or declined)
// is not work yet and lives on the Proposals page (lib/dal/approvals.ts). Every list can be narrowed to one project
// (the navigation's project picker, docs/PLAN.md 2026-11-03 log). Assignment is a set of people (task_assignees):
// every row carries it as JSON, so no list joins people.

const CLOSED = [...CLOSED_STATUSES];
const creatorUser = alias(users, "creator_user");
const approverUser = alias(users, "approver_user");
const parentGoal = alias(goals, "parent_goal");

/** The tenancy boundary for tasks: this workspace. Everyone in it reads its tasks. */
function visibility(viewer: Viewer): SQL {
  return eq(tasks.orgId, viewer.orgId);
}

/** Work, not proposals: a task that was live from the start, or a proposal that was approved. */
export const liveOnly = sql`(${tasks.proposalStatus} is null or ${tasks.proposalStatus} = 'approved')`;

/** The project a list is narrowed to ("" means every project); an undefined condition is dropped by `and`. */
export const projectCondition = (project: string): SQL | undefined => (project === "" ? undefined : eq(tasks.projectId, project));

const todayFor = (viewer: Viewer) => dayKey(new Date(), viewer.timezone);
const isOpen = notInArray(tasks.status, CLOSED);
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`);

/** The goal itself and its sub-goals (one level, docs/PLAN.md 2026-10-30 log): what "under this goal" means. */
const goalFamily = (viewer: Viewer, goalId: string) =>
  sql`(select ${goals.id} from ${goals} where ${goals.orgId} = ${viewer.orgId} and (${goals.id} = ${goalId} or ${goals.parentGoalId} = ${goalId}))`;

/** Tasks serving a goal: linked to it, or to one of its sub-goals. */
function inGoal(viewer: Viewer, goalId: string): SQL {
  return sql`${tasks.goalId} in ${goalFamily(viewer, goalId)}`;
}

// --- assignment and comments, in SQL --------------------------------------------------------------------------

/** The people on the task, as JSON, alphabetically (reports select it too). */
export const assigneesJson = sql<Person[]>`coalesce((select json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'image', u.image) order by u.name nulls last, u.email) from task_assignees ta join users u on u.id = ta.user_id where ta.task_id = ${tasks}.id), '[]'::json)`;

const assignedTo = (userId: string) => sql`exists (select 1 from task_assignees ta where ta.task_id = ${tasks}.id and ta.user_id = ${userId})`;
/** Nobody. */
const unassigned = sql`not exists (select 1 from task_assignees ta where ta.task_id = ${tasks}.id)`;

/** Comments nobody has resolved: while there are any, the task can't be completed (lib/tasks/transitions.ts). */
export const openCommentsSql = sql<number>`(select count(*)::int from task_updates u where u.task_id = ${tasks}.id and u.kind = 'comment' and u.resolved_at is null)`;

/** A proposal's chain with the people in it, in order (lib/dal/approvals.ts reads the same shape). */
export const approvalsJson = sql<ApprovalStepView[]>`coalesce((
  select json_agg(json_build_object(
    'id', a.id, 'position', a.position, 'decision', a.decision, 'decidedAt', a.decided_at, 'note', a.note,
    'user', case when su.id is null then null else json_build_object('id', su.id, 'name', su.name, 'email', su.email, 'image', su.image) end,
    'decidedBy', case when du.id is null then null else json_build_object('id', du.id, 'name', du.name, 'email', du.email, 'image', du.image) end
  ) order by a.position)
  from task_approvals a left join users su on su.id = a.user_id left join users du on du.id = a.decided_by
  where a.task_id = ${tasks}.id), '[]'::json)`;

// --- list rows -----------------------------------------------------------------------------------------------

const listColumns = {
  id: tasks.id,
  title: tasks.title,
  description: sql<string | null>`left(${tasks.description}, 600)`,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  dueTime: tasks.dueTime,
  recurrence: tasks.recurrence,
  nextAction: tasks.nextAction,
  latestProgress: sql<string | null>`left(${tasks.latestProgress}, 600)`,
  updatedAt: tasks.updatedAt,
  createdBy: tasks.createdBy,
  proposalStatus: tasks.proposalStatus,
  goalId: goals.id,
  goalTitle: goals.title,
  projectId: projects.id,
  projectName: projects.name,
  assignees: assigneesJson,
};

type ListRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskListItem["priority"];
  dueDate: string | null;
  dueTime: string | null;
  recurrence: Recurrence | null;
  nextAction: string | null;
  latestProgress: string | null;
  updatedAt: Date;
  createdBy: string;
  proposalStatus: ProposalStatus | null;
  goalId: string | null;
  goalTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  assignees: Person[];
};

export function toListItem(row: ListRow, viewer: Viewer): TaskListItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    dueTime: row.dueTime,
    repeats: row.recurrence ? describeRecurrence(row.recurrence, row.dueDate) : null,
    nextAction: row.nextAction,
    latestProgress: row.latestProgress,
    updatedAt: row.updatedAt.toISOString(),
    project: row.projectId && row.projectName ? { id: row.projectId, name: row.projectName } : null,
    goal: row.goalId && row.goalTitle ? { id: row.goalId, title: row.goalTitle } : null,
    proposal: row.proposalStatus,
    canDelete: canDeleteTask(viewer, { createdBy: row.createdBy, proposalStatus: row.proposalStatus }),
    assignees: row.assignees,
  };
}

/** `select <list row> from tasks` with the joins every row needs (its project and goal); assignees come as JSON. */
export function selectList() {
  return db.select(listColumns).from(tasks).leftJoin(projects, eq(projects.id, tasks.projectId)).leftJoin(goals, eq(goals.id, tasks.goalId));
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

const isNull = (column: AnyPgColumn) => sql`${column} is null`;

/** A calendar-day range on an instant column, in the viewer's timezone (written as instant bounds so indexes apply). */
export function dateRangeConditions(column: AnyPgColumn, from: string, to: string, timeZone: string): SQL[] {
  const out: SQL[] = [];
  if (from) out.push(sql`${column} >= (${from}::date::timestamp at time zone ${timeZone})`);
  if (to) out.push(sql`${column} < ((${to}::date + 1)::timestamp at time zone ${timeZone})`);
  return out;
}

/** The From / To range of the filters, on the date they name. */
function dateFilterConditions(viewer: Viewer, filters: Pick<TaskFilters, "dateField" | "from" | "to">): SQL[] {
  if (!filters.dateField || (!filters.from && !filters.to)) return [];
  const column = filters.dateField === "created" ? tasks.createdAt : filters.dateField === "completed" ? tasks.completedAt : tasks.updatedAt;
  return dateRangeConditions(column, filters.from, filters.to, viewer.timezone);
}

/** The conditions every filter shares between the list and the board (status is handled by each). */
function filterConditions(viewer: Viewer, filters: TaskFilters, today: string): SQL[] {
  const where: SQL[] = [visibility(viewer), liveOnly];
  if (filters.q) {
    const term = `%${escapeLike(filters.q)}%`;
    where.push(or(ilike(tasks.title, term), ilike(tasks.description, term))!);
  }
  if (filters.assignee === "me") where.push(assignedTo(viewer.userId));
  else if (filters.assignee === "none") where.push(unassigned);
  else if (filters.assignee) where.push(assignedTo(filters.assignee));
  if (filters.priority) where.push(eq(tasks.priority, filters.priority));
  const scoped = projectCondition(filters.project);
  if (scoped) where.push(scoped);
  if (filters.goal === "none") where.push(isNull(tasks.goalId));
  else if (filters.goal) where.push(inGoal(viewer, filters.goal));
  if (filters.due === "overdue") where.push(sql`${tasks.dueDate} < ${today}::date`, isOpen);
  if (filters.due === "week") where.push(sql`${tasks.dueDate} between ${today}::date and ${today}::date + 6`);
  if (filters.due === "none") where.push(isNull(tasks.dueDate));
  where.push(...dateFilterConditions(viewer, filters));
  return where;
}

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

/** Title and description search for the command palette: open tasks first, then the most recently touched. */
export async function searchTasks(viewer: Viewer, q: string, limit = 8): Promise<TaskListItem[]> {
  const term = q.trim().slice(0, 100);
  if (term === "") return [];
  const like = `%${escapeLike(term)}%`;
  const rows = await selectList()
    .where(and(visibility(viewer), liveOnly, or(ilike(tasks.title, like), ilike(tasks.description, like))))
    .orderBy(sql`(${tasks.status} in ('completed', 'rejected'))`, desc(tasks.updatedAt))
    .limit(limit);
  return rows.map((row) => toListItem(row, viewer));
}

/** The tasks most recently touched in the workspace: what the palette offers before anything is typed. */
export async function recentTasks(viewer: Viewer, limit = 6): Promise<TaskListItem[]> {
  const rows = await selectList()
    .where(and(visibility(viewer), liveOnly))
    .orderBy(desc(tasks.updatedAt))
    .limit(limit);
  return rows.map((row) => toListItem(row, viewer));
}

// --- attention, My Work --------------------------------------------------------------------------------------

const ATTENTION_RANK: Record<string, number> = { Overdue: 0, Blocked: 1, "Your approval": 2, "Awaiting approval": 3, Unassigned: 4, "Due soon": 5 };

/**
 * Open work in the workspace that needs someone's hand (Home and Members): overdue, blocked, awaiting approval,
 * unassigned, or due within DUE_SOON_DAYS. Each item carries one `reason`; the most pressing wins, then the
 * nearest due date.
 */
export async function attentionTasks(viewer: Viewer, today: string, limit = 50, project = ""): Promise<TaskListItem[]> {
  const rows = await db
    .select({ ...listColumns, approverId: tasks.approverId })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(goals, eq(goals.id, tasks.goalId))
    .where(
      and(
        visibility(viewer),
        liveOnly,
        projectCondition(project),
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
  /** The goal the task serves: what the decision touches. */
  goal: { id: string; title: string } | null;
  assignees: Person[];
  evidence: { url: string; label: string | null }[];
  /** Open comments: approving is refused until they are resolved. */
  openComments: number;
};

/**
 * Tasks waiting for approval across the workspace, along with their latest progress,
 * completion summaries, and evidence links so supervisors have the facts before approving.
 * `project` narrows them the way every list is: "" for all, or a project id.
 */
export async function approvalStagingTasks(viewer: Viewer, project = ""): Promise<ApprovalStagingTask[]> {
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
      goalId: goals.id,
      goalTitle: goals.title,
      people: assigneesJson,
      openComments: openCommentsSql,
      evidence: sql<{ url: string; label: string | null }[]>`coalesce((select json_agg(json_build_object('url', l.url, 'label', l.label) order by l.created_at) from task_links l where l.task_id = ${tasks}.id), '[]'::json)`,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(goals, eq(goals.id, tasks.goalId))
    .where(and(eq(tasks.orgId, viewer.orgId), liveOnly, projectCondition(project), eq(tasks.status, "awaiting_approval")))
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
    goal: row.goalId && row.goalTitle ? { id: row.goalId, title: row.goalTitle } : null,
    assignees: row.people,
    evidence: row.evidence,
    openComments: row.openComments,
  }));
}

/** What narrows My Work: the project scope, and an optional date range (the List tab's "Dates" filter). */
export type MyWorkOptions = { project?: string; dates?: Pick<TaskFilters, "dateField" | "from" | "to"> };

/**
 * Everything My Work groups, in one query: my open work and my recently finished work, and approvals I owe.
 * With a date range, "recently finished" is whatever completed inside it instead of the last two weeks.
 */
export async function myWorkRows(viewer: Viewer, options: MyWorkOptions = {}): Promise<MyWorkRow[]> {
  const me = viewer.userId;
  const dated = options.dates !== undefined && options.dates.dateField !== "" && (options.dates.from !== "" || options.dates.to !== "");
  const finished = dated ? eq(tasks.status, "completed") : sql`(${tasks.status} = 'completed' and ${tasks.completedAt} > now() - make_interval(days => ${RECENTLY_FINISHED_DAYS}))`;
  const rows = await db
    .select({
      ...listColumns,
      mine: sql<boolean>`${assignedTo(me)}`,
      approverId: tasks.approverId,
      sortRank: tasks.sortRank,
      completedAt: tasks.completedAt,
      lastStatusKind: sql<string | null>`(select a.kind::text from task_activity a where a.task_id = ${tasks}.id and a.kind in ('sent_back', 'approval_requested', 'approved', 'status_changed', 'blocked', 'unblocked', 'completed', 'reopened', 'rejected') order by a.created_at desc limit 1)`,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(goals, eq(goals.id, tasks.goalId))
    .where(
      and(
        visibility(viewer),
        liveOnly,
        projectCondition(options.project ?? ""),
        ...(options.dates ? dateFilterConditions(viewer, options.dates) : []),
        or(and(assignedTo(me), or(isOpen, finished)), and(eq(tasks.approverId, me), eq(tasks.status, "awaiting_approval"))),
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
export async function myWorkGroups(viewer: Viewer, today: string, options: MyWorkOptions = {}): Promise<MyWorkGroups> {
  return groupMyWork(await myWorkRows(viewer, options), viewer.userId, today);
}

/**
 * "Pick up where you left off": the viewer's work they can act on now, in My Work order (Needs attention with
 * its reasons, then Continue working). Waiting and finished work is left out. Home shows the first five.
 */
export async function myWorkTasks(viewer: Viewer, project = ""): Promise<TaskListItem[]> {
  return resumeOrder(await myWorkGroups(viewer, todayFor(viewer), { project }));
}

// --- projects, goals, counts, workload ---------------------------------------------------------------------

const groupedOrder = (today: string) => [sql`(${tasks.status} in ('completed', 'rejected'))`, ...orderBy("smart", today)];

/** Every live task in a project (open first, in the smart order), for the project page to group by status. */
export async function tasksForProject(viewer: Viewer, projectId: string): Promise<TaskListItem[]> {
  const rows = await selectList()
    .where(and(visibility(viewer), liveOnly, eq(tasks.projectId, projectId)))
    .orderBy(...groupedOrder(todayFor(viewer)))
    .limit(500);
  return rows.map((row) => toListItem(row, viewer));
}

/** Every live task serving a goal: linked to it or to one of its sub-goals (open first). */
export async function tasksForGoal(viewer: Viewer, goalId: string): Promise<TaskListItem[]> {
  const rows = await selectList()
    .where(and(visibility(viewer), liveOnly, inGoal(viewer, goalId)))
    .orderBy(...groupedOrder(todayFor(viewer)))
    .limit(500);
  return rows.map((row) => toListItem(row, viewer));
}

/** The open tasks of several goals at once (the Goals page lists a few under each goal), keyed by goal id. */
export async function openTasksForGoals(viewer: Viewer, goalIds: string[]): Promise<Map<string, TaskListItem[]>> {
  const out = new Map<string, TaskListItem[]>(goalIds.map((id) => [id, []]));
  if (goalIds.length === 0) return out;
  const rows = await selectList()
    .where(and(visibility(viewer), liveOnly, isOpen, inArray(tasks.goalId, goalIds)))
    .orderBy(...orderBy("smart", todayFor(viewer)))
    .limit(1000);
  for (const row of rows) {
    if (row.goalId === null) continue;
    out.get(row.goalId)?.push(toListItem(row, viewer));
  }
  return out;
}

type ProgressRow = { key: string; taskId: string; status: TaskStatus; dueDate: string | null };

/** Counts each (key, task) pair once. */
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
 * Progress per goal (completed / total, plus blocked and overdue), counting the live tasks linked to the goal and
 * to its sub-goals. Rejected tasks are left out of the total: they will never be completed. Every id asked for gets
 * an entry, zeros included.
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
  const direct = await db
    .select({ taskId: tasks.id, status: tasks.status, dueDate: tasks.dueDate, key: tasks.goalId })
    .from(tasks)
    .where(and(visibility(viewer), liveOnly, ne(tasks.status, "rejected"), inArray(tasks.goalId, allIds)));
  const rows: ProgressRow[] = [];
  for (const row of direct) {
    if (row.key === null) continue;
    if (goalIds.includes(row.key)) rows.push({ ...row, key: row.key });
    const parent = parentOf.get(row.key);
    if (parent !== undefined && goalIds.includes(parent)) rows.push({ ...row, key: parent });
  }
  return tallyProgress(rows, goalIds, todayFor(viewer));
}

/** Progress per project, the same shape as progressForGoals: every live task in the project. */
export async function progressForProjects(viewer: Viewer, projectIds: string[]): Promise<Map<string, TaskProgress>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ key: tasks.projectId, taskId: tasks.id, status: tasks.status, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(visibility(viewer), liveOnly, ne(tasks.status, "rejected"), inArray(tasks.projectId, projectIds)));
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
export async function taskCounts(viewer: Viewer, options: { today: string; since: Date; project?: string }): Promise<TaskCounts> {
  const [row] = await db
    .select({
      active: countIf(isOpen),
      completed: countIf(and(eq(tasks.status, "completed"), gte(tasks.completedAt, options.since))!),
      overdue: countIf(and(isOpen, sql`${tasks.dueDate} < ${options.today}::date`)!),
      blocked: countIf(eq(tasks.status, "blocked")),
      awaiting: countIf(eq(tasks.status, "awaiting_approval")),
    })
    .from(tasks)
    .where(and(visibility(viewer), liveOnly, projectCondition(options.project ?? "")));
  return row ?? { active: 0, completed: 0, overdue: 0, blocked: 0, awaiting: 0 };
}

/**
 * Open work per person (Home's Workload): every worker, even with nothing assigned, then an "Unassigned" row
 * (person null) when open work has nobody on it. A task with three people on it is in three rows.
 */
export async function workload(viewer: Viewer, project = ""): Promise<WorkloadRow[]> {
  if (isStakeholder(viewer)) return [];
  const today = todayFor(viewer);
  const [workers, rows] = await Promise.all([
    listWorkers(viewer),
    selectList()
      .where(and(visibility(viewer), liveOnly, projectCondition(project), isOpen))
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
 * approved, sent back, rejected, due date changed, reopened, proposals decided. Edits and progress updates are
 * left out on purpose.
 */
export async function recentActivity(viewer: Viewer, limit: number, since?: Date, project = ""): Promise<ActivityFeedItem[]> {
  const actor = alias(users, "actor_user");
  const where: SQL[] = [eq(taskActivity.orgId, viewer.orgId), visibility(viewer), inArray(taskActivity.kind, [...FEED_KINDS])];
  if (since) where.push(gte(taskActivity.createdAt, since));
  const scoped = projectCondition(project);
  if (scoped) where.push(scoped);
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

const scopeOf = (task: { orgId: string; createdBy: string; approverId: string | null; proposalStatus: ProposalStatus | null }, assignees: Person[] | string[]): TaskScope => ({
  orgId: task.orgId,
  assigneeIds: assignees.map((each) => (typeof each === "string" ? each : each.id)),
  createdBy: task.createdBy,
  approverId: task.approverId,
  proposalStatus: task.proposalStatus,
});

/** One task with everything its page shows, plus the scope its permission checks need (null when not found). */
export async function getTask(viewer: Viewer, id: string): Promise<{ detail: TaskDetail; scope: TaskScope } | null> {
  const [row] = await db
    .select({
      task: tasks,
      projectName: projects.name,
      goalTitle: goals.title,
      assignees: assigneesJson,
      approvals: approvalsJson,
      openComments: openCommentsSql,
      approver: sql<Person | null>`case when ${approverUser.id} is null then null else ${personJson(approverUser)} end`,
      creator: sql<Person>`${personJson(creatorUser)}`,
      lastUpdate: sql<{ author: Person; at: string } | null>`(select json_build_object('at', u.created_at, 'author', json_build_object('id', au.id, 'name', au.name, 'email', au.email, 'image', au.image)) from task_updates u join users au on au.id = u.author_id where u.task_id = ${tasks}.id and u.kind = 'progress' order by u.created_at desc limit 1)`,
    })
    .from(tasks)
    .innerJoin(creatorUser, eq(creatorUser.id, tasks.createdBy))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(goals, eq(goals.id, tasks.goalId))
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
    dueTime: t.dueTime,
    recurrence: t.recurrence ?? null,
    seriesId: t.seriesId,
    project: t.projectId && row.projectName ? { id: t.projectId, name: row.projectName } : null,
    goal: t.goalId && row.goalTitle ? { id: t.goalId, title: row.goalTitle } : null,
    assignees: row.assignees,
    approver: row.approver,
    creator: row.creator,
    proposalStatus: t.proposalStatus,
    approvals: row.approvals.map((step) => ({ ...step, decidedAt: step.decidedAt ? new Date(step.decidedAt).toISOString() : null })),
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
  return { detail, scope: scopeOf(t, row.assignees) };
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
      proposalStatus: tasks.proposalStatus,
      nextAction: tasks.nextAction,
      blockedReason: tasks.blockedReason,
      blockedBy: tasks.blockedBy,
      recurrence: tasks.recurrence,
      dueDate: tasks.dueDate,
      assignees: assigneesJson,
      openComments: openCommentsSql,
    })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.orgId, viewer.orgId)));
  if (!row) return null;
  const { assignees, ...basics } = row;
  return {
    ...basics,
    assigneeIds: assignees.map((person) => person.id),
    scope: scopeOf({ orgId: viewer.orgId, createdBy: row.createdBy, approverId: row.approverId, proposalStatus: row.proposalStatus }, assignees),
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
    .select({ task: tasks, openComments: openCommentsSql })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.orgId, orgId)))
    .for("update", { of: tasks });
  if (!row) return null;
  const t = { ...row.task, openComments: row.openComments };
  const assignment = await assignmentOf(tx, t.id);
  return { task: t, assignment, scope: scopeOf(t, assignment) };
}

/** Whether another occurrence of a repeating series is still open (so finishing one never makes two next ones). */
export async function seriesHasOpenTask(tx: Tx, orgId: string, seriesId: string, exceptId: string): Promise<boolean> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.seriesId, seriesId), ne(tasks.id, exceptId), isOpen));
  return (row?.n ?? 0) > 0;
}

// --- pickers --------------------------------------------------------------------------------------------------------

/** The workers who can be assigned, take over or approve a task, with their role (for default approvers and labels). */
export async function taskPeople(viewer: Viewer): Promise<PersonOption[]> {
  const workers = await listWorkers(viewer);
  return workers.map((worker) => ({ id: worker.userId, name: worker.name, email: worker.email, image: worker.image, role: worker.role }));
}

/** A sub-goal is offered as "Parent › Sub-goal", so two goals with similar names stay apart in a short list. */
export const goalOptionLabel = (title: string, parentTitle: string | null): string => (parentTitle ? `${parentTitle} › ${title}` : title);

/** The projects and goals new work can join: the active ones, by name (goals grouped by project, sub-goals after their parent). */
export async function activePlanning(viewer: Viewer): Promise<Pick<TaskFormOptions, "projects" | "goals">> {
  const [projectRows, goalRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.orgId, viewer.orgId), eq(projects.status, "active")))
      .orderBy(asc(projects.name)),
    db
      .select({ id: goals.id, title: goals.title, projectId: goals.projectId, parentTitle: parentGoal.title, projectName: projects.name })
      .from(goals)
      .innerJoin(projects, eq(projects.id, goals.projectId))
      .leftJoin(parentGoal, eq(parentGoal.id, goals.parentGoalId))
      .where(and(eq(goals.orgId, viewer.orgId), eq(goals.status, "active")))
      .orderBy(asc(projects.name), asc(sql`coalesce(${parentGoal.title}, ${goals.title})`), sql`${goals.parentGoalId} is not null`, asc(goals.title)),
  ]);
  const goalOptions: GoalOption[] = goalRows.map((row) => ({ id: row.id, title: goalOptionLabel(row.title, row.parentTitle), projectId: row.projectId }));
  return { projects: projectRows, goals: goalOptions };
}

/** What the New task form offers: the workers, the active projects and the active goals. */
export async function taskFormOptions(viewer: Viewer): Promise<TaskFormOptions> {
  const [people, planning] = await Promise.all([taskPeople(viewer), activePlanning(viewer)]);
  return {
    viewerId: viewer.userId,
    people: people.map(({ id, name, email, image }) => ({ id, name, email, image })),
    ...planning,
    canCapture: false,
    proposesOnly: isStakeholder(viewer),
  };
}
