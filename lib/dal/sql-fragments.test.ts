import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { CLOSED_STATUSES, CLOSED_WITHOUT_COMPLETION } from "@/lib/constants";
import { assigneesJson, countsTowardsProgress, goalTitleSql, groupNameSql, groupSizeSql, needsSignOffSql, openCommentsSql, otherOpenGoalTasksSql, selectList, taskLabelSql } from "@/lib/dal/tasks";

// A correlated subquery must name the outer table. Drizzle renders `${tasks.id}` as a bare "id" in a select from one
// table (no join), and inside the subquery that bare "id" is the subquery's own column, so the count came back 0 and
// the people empty (the status dialog's open-comment hold, 2026-11-03). `${tasks}.id` is qualified whatever the query.
describe("correlated SQL fragments", () => {
  it("name the outer table even in a select from one table", () => {
    const { sql } = db.select({ people: assigneesJson, open: openCommentsSql }).from(tasks).toSQL();
    expect(sql).toContain('ta.task_id = "tasks".id');
    expect(sql).toContain('u.task_id = "tasks".id');
    expect(sql).not.toMatch(/= "id"\b/);
  });

  it("the sign-off fragment names the joined goal and project and the task's own maker", () => {
    const { sql } = selectList().toSQL();
    expect(sql).toContain('b.goal_id = "goals".id and b.user_id = "tasks".created_by');
    expect(sql).toContain('b.project_id = "projects".id and b.user_id = "tasks".created_by');
    expect(needsSignOffSql).toBeDefined();
  });

  it("a closer's fragments read the outer task's goal: its name, and the other open tasks it waits for", () => {
    const { sql } = db.select({ goal: goalTitleSql, waitsFor: otherOpenGoalTasksSql, label: taskLabelSql }).from(tasks).toSQL();
    expect(sql).toContain('g.id = "tasks".goal_id');
    // The count leaves the task itself out and stays inside its workspace, its goal and that goal's sub-goals.
    expect(sql).toContain('o.org_id = "tasks".org_id and o.id <> "tasks".id');
    expect(sql).toContain('g.id = "tasks".goal_id or g.parent_goal_id = "tasks".goal_id');
    expect(sql).toContain('case when "tasks".goal_closer then');
    expect(sql).not.toMatch(/= "(id|goal_id|org_id)"/);
  });

  it("a group's fragments read the outer task's group: its name, and how many live tasks are in it", () => {
    const { sql } = db.select({ name: groupNameSql, size: groupSizeSql }).from(tasks).toSQL();
    expect(sql).toContain('tg.id = "tasks".group_id');
    expect(sql).toContain('m.group_id = "tasks".group_id');
    expect(sql).not.toMatch(/= "group_id"/);
  });

  it("progress leaves out every status that closes a task without completing it, not only rejected", () => {
    const { sql, params } = db.select({ id: tasks.id }).from(tasks).where(countsTowardsProgress).toSQL();
    expect(sql).toContain('"tasks"."status" not in');
    expect(params).toEqual(["rejected", "deferred", "cancelled", "merged"]);
    // The closed set every "open" test uses is those four and completed: none of them is ever overdue.
    expect([...CLOSED_STATUSES].sort()).toEqual([...CLOSED_WITHOUT_COMPLETION, "completed"].sort());
  });

  it("the list row carries its group", () => {
    const { sql } = selectList().toSQL();
    expect(sql).toContain('"tasks"."group_id"');
    expect(sql).toContain('m.group_id = "tasks".group_id');
  });
});
