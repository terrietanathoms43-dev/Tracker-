import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { assigneesJson, openCommentsSql } from "@/lib/dal/tasks";

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
});
