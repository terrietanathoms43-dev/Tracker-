import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Viewer } from "@/lib/permissions";
import { DEFAULT_FILTERS } from "@/lib/tasks/filters";
import { OTHER_ORG, TEST_ORG, TEST_PERSONAS } from "@/lib/test-mode";
import { dayKey } from "@/lib/time";

// Cross-workspace isolation, proven against the real database with the two seeded workspaces: nothing of Trackwise
// Demo is visible from Other Co (by id or in any list), and the other way round; a stakeholder's lists hold only
// the tasks made from their own requests. Opt-in, because it needs DATABASE_URL and a seeded database:
//
//   npm run test:seed && TRACKWISE_DB_TESTS=1 npx vitest run lib/dal/isolation.test.ts
config({ path: [".env.local", ".env"], quiet: true });
const enabled = process.env.TRACKWISE_DB_TESTS === "1" && Boolean(process.env.DATABASE_URL);

type Dal = typeof import("./tasks") & typeof import("./history") & typeof import("./notifications") & typeof import("./orgs") & typeof import("./members") & typeof import("./goals");

describe.skipIf(!enabled)("workspace isolation (database)", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rows = async <T>(text: string, params: unknown[] = []): Promise<T[]> => (await pool.query(text, params)).rows as T[];
  const one = async <T>(text: string, params: unknown[] = []): Promise<T> => {
    const [row] = await rows<T>(text, params);
    if (row === undefined) throw new Error(`Seeded row missing (run npm run test:seed): ${text}`);
    return row;
  };

  let dal: Dal;
  let demo: { orgId: string; taskIds: string[]; linkedTaskId: string; projectId: string; goalId: string; subGoalId: string; parentGoalId: string };
  let other: { orgId: string; taskIds: string[]; projectId: string; goalId: string };
  let avery: Viewer;
  let riley: Viewer;
  let taylor: Viewer;
  let jordanId: string;

  const viewer = (userId: string, orgId: string, orgRole: Viewer["orgRole"], timezone: string): Viewer => ({ userId, orgId, orgRole, timezone });
  const userId = async (email: string) => (await one<{ id: string }>("select id from users where email = $1", [email])).id;
  const today = (who: Viewer) => dayKey(new Date(), who.timezone);
  const everything = { ...DEFAULT_FILTERS, closed: true };

  beforeAll(async () => {
    // Imported after dotenv has run: db/index.ts reads DATABASE_URL when it is first loaded.
    const [tasksDal, historyDal, notificationsDal, orgsDal, membersDal, goalsDal] = await Promise.all([
      import("./tasks"),
      import("./history"),
      import("./notifications"),
      import("./orgs"),
      import("./members"),
      import("./goals"),
    ]);
    dal = { ...tasksDal, ...historyDal, ...notificationsDal, ...orgsDal, ...membersDal, ...goalsDal };

    const demoOrgId = (await one<{ id: string }>("select id from organizations where slug = $1", [TEST_ORG.slug])).id;
    const otherOrgId = (await one<{ id: string }>("select id from organizations where slug = $1", [OTHER_ORG.slug])).id;
    const taskIds = async (orgId: string) => (await rows<{ id: string }>("select id from tasks where org_id = $1", [orgId])).map((row) => row.id);
    const subGoal = await one<{ id: string; parent_goal_id: string }>("select id, parent_goal_id from goals where org_id = $1 and parent_goal_id is not null limit 1", [demoOrgId]);
    demo = {
      orgId: demoOrgId,
      taskIds: await taskIds(demoOrgId),
      linkedTaskId: (await one<{ task_id: string }>("select l.task_id from task_links l join tasks t on t.id = l.task_id where t.org_id = $1 limit 1", [demoOrgId])).task_id,
      projectId: (await one<{ id: string }>("select id from projects where org_id = $1 limit 1", [demoOrgId])).id,
      goalId: (await one<{ id: string }>("select id from goals where org_id = $1 limit 1", [demoOrgId])).id,
      subGoalId: subGoal.id,
      parentGoalId: subGoal.parent_goal_id,
    };
    other = {
      orgId: otherOrgId,
      taskIds: await taskIds(otherOrgId),
      projectId: (await one<{ id: string }>("select id from projects where org_id = $1 limit 1", [otherOrgId])).id,
      goalId: (await one<{ id: string }>("select id from goals where org_id = $1 limit 1", [otherOrgId])).id,
    };
    avery = viewer(await userId(TEST_PERSONAS.admin.email), demo.orgId, "admin", TEST_ORG.timezone);
    riley = viewer(await userId(TEST_PERSONAS.other.email), other.orgId, "admin", OTHER_ORG.timezone);
    taylor = viewer(await userId(TEST_PERSONAS.stakeholder.email), demo.orgId, "stakeholder", TEST_ORG.timezone);
    jordanId = await userId(TEST_PERSONAS.member.email);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("the seed gives both workspaces work, so the checks below are not vacuous", () => {
    expect(demo.taskIds.length).toBeGreaterThan(10);
    expect(other.taskIds.length).toBeGreaterThan(0);
  });

  it("Other Co's admin cannot read Trackwise Demo rows by id", async () => {
    expect(await dal.getTask(riley, demo.taskIds[0])).toBeNull();
    expect(await dal.getTaskBasics(riley, demo.taskIds[0])).toBeNull();
    expect(await dal.listLinks(riley, demo.linkedTaskId)).toEqual([]);
    expect((await dal.listHistory(riley, demo.linkedTaskId, null)).items).toEqual([]);
    expect(await dal.tasksForProject(riley, demo.projectId)).toEqual([]);
    expect(await dal.tasksForGoal(riley, demo.goalId)).toEqual([]);
    expect(await dal.getGoal(riley, demo.goalId)).toBeNull();
    expect(await dal.subGoalsOf(riley, demo.parentGoalId)).toEqual([]);
    expect((await dal.progressForGoals(riley, [demo.goalId])).get(demo.goalId)).toEqual({ completed: 0, total: 0, blocked: 0, overdue: 0 });
    expect((await dal.progressForProjects(riley, [demo.projectId])).get(demo.projectId)).toEqual({ completed: 0, total: 0, blocked: 0, overdue: 0 });
  });

  it("Other Co's lists hold exactly its own work and none of Trackwise Demo's", async () => {
    const ids = (items: { id: string }[]) => items.map((item) => item.id);
    const listed = ids((await dal.listTasks(riley, everything, { today: today(riley), limit: 500 })).items);
    expect(listed.sort()).toEqual([...other.taskIds].sort());

    const board = await dal.boardTasks(riley, everything, { today: today(riley) });
    const onBoard = Object.values(board).flatMap(ids);
    const leaks = (found: string[]) => found.filter((id) => demo.taskIds.includes(id));
    expect(leaks(onBoard)).toEqual([]);
    expect(leaks(ids(await dal.searchTasks(riley, "the")))).toEqual([]);
    expect(leaks(ids(await dal.attentionTasks(riley, today(riley), 500)))).toEqual([]);
    expect(leaks((await dal.myWorkRows(riley)).map((row) => row.item.id))).toEqual([]);
    expect(leaks((await dal.workload(riley)).flatMap((row) => ids(row.active)))).toEqual([]);
    expect(leaks((await dal.recentActivity(riley, 500)).map((item) => item.task.id))).toEqual([]);
    expect((await dal.listGoals(riley, { includeAchieved: true })).some((goal) => goal.id === demo.goalId)).toBe(false);

    const counts = await dal.taskCounts(riley, { today: today(riley), since: new Date(0) });
    expect(counts.active + counts.completed).toBeLessThanOrEqual(other.taskIds.length);
    const members = (await dal.listMembers(riley)).map((member) => member.email).sort();
    expect(members).toEqual([TEST_PERSONAS.other.email, "casey@trackwise.test"].sort());
    expect((await dal.memberDirectory(riley)).map((member) => member.email).sort()).toEqual(members);
  });

  it("a sub-goal's tasks count for the sub-goal and roll up into its parent", async () => {
    const sub = await dal.getGoal(avery, demo.subGoalId);
    const parent = await dal.getGoal(avery, demo.parentGoalId);
    expect(sub?.parent?.id).toBe(demo.parentGoalId);
    expect(sub?.progress.total).toBeGreaterThan(0);
    expect(parent?.subGoals).toBeGreaterThan(0);
    expect(parent?.progress.total).toBeGreaterThanOrEqual(sub!.progress.total);
    const subTasks = await dal.tasksForGoal(avery, demo.subGoalId);
    const parentTasks = await dal.tasksForGoal(avery, demo.parentGoalId);
    expect(subTasks.every((task) => parentTasks.some((each) => each.id === task.id))).toBe(true);
    // The goals list shows top-level goals only; the sub-goal is reached from its parent's page.
    expect((await dal.listGoals(avery, { includeAchieved: true })).some((goal) => goal.id === demo.subGoalId)).toBe(false);
    expect((await dal.subGoalsOf(avery, demo.parentGoalId)).some((goal) => goal.id === demo.subGoalId)).toBe(true);
  });

  it("Trackwise Demo's admin sees none of Other Co's work, by id or in a list", async () => {
    expect(await dal.getTask(avery, other.taskIds[0])).toBeNull();
    expect(await dal.tasksForProject(avery, other.projectId)).toEqual([]);
    expect(await dal.tasksForGoal(avery, other.goalId)).toEqual([]);
    const listed = (await dal.listTasks(avery, everything, { today: today(avery), limit: 500 })).items.map((item) => item.id);
    expect(listed.sort()).toEqual([...demo.taskIds].sort());
  });

  it("a viewer only ever filters by its own workspace: a forged one for Other Co reaches nothing of the demo", async () => {
    // lib/viewer.ts validates the active workspace against membership before a Viewer exists. Even if that were
    // bypassed, every query filters by the Viewer's orgId, so Jordan "in" Other Co finds neither his demo task
    // nor his demo notifications.
    const forged = viewer(jordanId, other.orgId, "member", OTHER_ORG.timezone);
    expect(await dal.getTask(forged, demo.taskIds[0])).toBeNull();
    expect(await dal.listNotifications(forged)).toEqual([]);
    expect(await dal.unreadCount(forged)).toBe(0);
    const jordan = viewer(jordanId, demo.orgId, "member", TEST_ORG.timezone);
    expect((await dal.listNotifications(jordan)).length).toBeGreaterThan(0);
  });

  it("a stakeholder's lists hold only the tasks made from their own requests", async () => {
    const own = (
      await rows<{ id: string }>("select t.id from tasks t join requests r on r.id = t.request_id where r.requester_id = $1 and t.org_id = $2", [
        taylor.userId,
        demo.orgId,
      ])
    ).map((row) => row.id);
    expect(own.length).toBeGreaterThan(0);
    const listed = (await dal.listTasks(taylor, everything, { today: today(taylor), limit: 500 })).items.map((item) => item.id);
    expect(listed.sort()).toEqual([...own].sort());
    expect((await dal.searchTasks(taylor, "the")).every((item) => own.includes(item.id))).toBe(true);
    expect((await dal.attentionTasks(taylor, today(taylor), 500)).every((item) => own.includes(item.id))).toBe(true);
    expect((await dal.recentActivity(taylor, 500)).every((item) => own.includes(item.task.id))).toBe(true);
    expect(await dal.workload(taylor)).toEqual([]);
  });
});
