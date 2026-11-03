/**
 * Moves an existing database into the 2026-11-03 shape (docs/PLAN.md decision log): the rigid funnel
 * workspace → projects → goals → tasks, goals that belong to a project, no requests, no legacy team tables.
 *
 *   npm run db:backup               first: every table to backups/<stamp>/
 *   npm run db:migrate-hierarchy    this script (one transaction, idempotent: safe to run twice)
 *   npm run db:push                 then: adds the new tables and columns (goal links, proposals, repeats)
 *
 * What it does, in order, each step skipped when already done:
 *   1. goals.project_id: added, then filled for every goal. A top-level goal goes to the project that pointed at
 *      it (the one with most tasks when several did), else to the project most of its tasks are in, else to a
 *      "General" project made for the workspace on the spot. A sub-goal takes its parent's project. Then NOT NULL.
 *   2. tasks: a task with a goal and no project joins the goal's project; a task whose goal sits in another
 *      project keeps its project and loses the goal link (listed in the output).
 *   3. projects.goal_id dropped (the link now points the other way).
 *   4. goal_status 'achieved' renamed 'completed'.
 *   5. requests, request_decisions and their enums dropped; tasks.request_id dropped. The task a request became
 *      stays, with the request's words already in its description.
 *   6. The legacy team tables and tasks.assignee_id dropped (unused since 2026-10-18 / 2026-10-30).
 *   7. notification_preferences.email_request_decision renamed email_proposal; request notifications removed.
 */
import "./load-env";
import { Pool, type PoolClient } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL });

type Row = Record<string, string | null>;

async function columnExists(client: PoolClient, table: string, column: string): Promise<boolean> {
  const result = await client.query("select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2", [table, column]);
  return (result.rowCount ?? 0) > 0;
}

async function tableExists(client: PoolClient, table: string): Promise<boolean> {
  const result = await client.query("select 1 from information_schema.tables where table_schema = 'public' and table_name = $1", [table]);
  return (result.rowCount ?? 0) > 0;
}

async function enumHasValue(client: PoolClient, type: string, value: string): Promise<boolean> {
  const result = await client.query("select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = $1 and e.enumlabel = $2", [type, value]);
  return (result.rowCount ?? 0) > 0;
}

async function migrate(client: PoolClient): Promise<string[]> {
  const notes: string[] = [];

  // --- 1. goals.project_id --------------------------------------------------------------------------------------
  if (!(await columnExists(client, "goals", "project_id"))) {
    await client.query("alter table goals add column project_id text references projects(id) on delete cascade");
    notes.push("added goals.project_id");
  }
  const hadProjectGoal = await columnExists(client, "projects", "goal_id");
  const orphans = await client.query<{ id: string; org_id: string; title: string; parent_goal_id: string | null; owner_id: string | null; created_by: string }>(
    "select id, org_id, title, parent_goal_id, owner_id, created_by from goals where project_id is null order by parent_goal_id nulls first, created_at",
  );
  const generalByOrg = new Map<string, string>();
  for (const goal of orphans.rows) {
    let projectId: string | null = null;
    let how = "";
    if (goal.parent_goal_id) {
      const parent = await client.query<Row>("select project_id from goals where id = $1", [goal.parent_goal_id]);
      projectId = parent.rows[0]?.project_id ?? null;
      how = "its parent's project";
    }
    if (projectId === null && hadProjectGoal) {
      const pointing = await client.query<Row>(
        "select p.id from projects p where p.goal_id = $1 and p.org_id = $2 order by (select count(*) from tasks t where t.project_id = p.id) desc, p.created_at asc limit 1",
        [goal.id, goal.org_id],
      );
      projectId = pointing.rows[0]?.id ?? null;
      how = "the project that rolled up into it";
    }
    if (projectId === null) {
      const byTasks = await client.query<Row>(
        "select t.project_id as id from tasks t where t.goal_id = $1 and t.project_id is not null group by t.project_id order by count(*) desc limit 1",
        [goal.id],
      );
      projectId = byTasks.rows[0]?.id ?? null;
      how = "the project most of its tasks are in";
    }
    if (projectId === null) {
      projectId = generalByOrg.get(goal.org_id) ?? null;
      if (projectId === null) {
        const existing = await client.query<Row>("select id from projects where org_id = $1 and name = 'General' limit 1", [goal.org_id]);
        projectId = existing.rows[0]?.id ?? null;
      }
      if (projectId === null) {
        const created = await client.query<Row>(
          `insert into projects (id, org_id, name, description, owner_id, status, created_by)
           values (gen_random_uuid()::text, $1, 'General', 'Made on 2026-11-03 when goals moved under projects: the goals that had no project landed here. Move them to the right project when you can.', $2, 'active', $3)
           returning id`,
          [goal.org_id, goal.owner_id, goal.created_by],
        );
        projectId = created.rows[0].id!;
        notes.push(`created a General project for workspace ${goal.org_id}`);
      }
      generalByOrg.set(goal.org_id, projectId);
      how = "the workspace's General project";
    }
    await client.query("update goals set project_id = $1 where id = $2", [projectId, goal.id]);
    notes.push(`goal "${goal.title}" → ${how}`);
  }
  // A sub-goal always sits in its parent's project.
  const moved = await client.query<Row>(
    "update goals g set project_id = p.project_id from goals p where p.id = g.parent_goal_id and g.project_id <> p.project_id returning g.title",
  );
  for (const row of moved.rows) notes.push(`sub-goal "${row.title}" moved to its parent's project`);
  const nullable = await client.query("select is_nullable from information_schema.columns where table_name = 'goals' and column_name = 'project_id'");
  if (nullable.rows[0]?.is_nullable === "YES") {
    await client.query("alter table goals alter column project_id set not null");
    notes.push("goals.project_id is now required");
  }
  await client.query("create index if not exists goals_org_project_idx on goals (org_id, project_id)");

  // --- 2. tasks follow their goal's project ------------------------------------------------------------------------
  const joined = await client.query<Row>("update tasks t set project_id = g.project_id from goals g where g.id = t.goal_id and t.project_id is null returning t.title");
  for (const row of joined.rows) notes.push(`task "${row.title}" joined its goal's project`);
  const unlinked = await client.query<Row>("update tasks t set goal_id = null from goals g where g.id = t.goal_id and t.project_id <> g.project_id returning t.title, g.title as goal");
  for (const row of unlinked.rows) notes.push(`task "${row.title}" kept its project and lost the goal "${row.goal}" (different project)`);

  // --- 3. projects.goal_id goes ------------------------------------------------------------------------------------
  if (hadProjectGoal) {
    await client.query("alter table projects drop column goal_id");
    notes.push("dropped projects.goal_id");
  }

  // --- 4. achieved → completed ---------------------------------------------------------------------------------
  if (await enumHasValue(client, "goal_status", "achieved")) {
    await client.query("alter type goal_status rename value 'achieved' to 'completed'");
    notes.push("renamed goal status achieved → completed");
  }

  // --- 5. requests go ---------------------------------------------------------------------------------------------
  if (await columnExists(client, "tasks", "request_id")) {
    await client.query("alter table tasks drop column request_id");
    notes.push("dropped tasks.request_id");
  }
  for (const table of ["request_decisions", "requests"]) {
    if (await tableExists(client, table)) {
      await client.query(`drop table ${table}`);
      notes.push(`dropped ${table}`);
    }
  }
  for (const type of ["request_decision", "request_status", "request_urgency"]) await client.query(`drop type if exists ${type}`);

  // --- 6. legacy teams go --------------------------------------------------------------------------------------------
  for (const table of ["task_teams", "goal_teams", "team_members", "teams"]) {
    if (await tableExists(client, table)) {
      await client.query(`drop table ${table}`);
      notes.push(`dropped ${table}`);
    }
  }
  if (await columnExists(client, "tasks", "assignee_id")) {
    await client.query("alter table tasks drop column assignee_id");
    notes.push("dropped tasks.assignee_id");
  }

  // --- 7. preferences and notifications ------------------------------------------------------------------------------
  if (await columnExists(client, "notification_preferences", "email_request_decision")) {
    await client.query("alter table notification_preferences rename column email_request_decision to email_proposal");
    notes.push("renamed email_request_decision → email_proposal");
  }
  const gone = await client.query("delete from notifications where kind = 'request_decided' or href like '/requests/%'");
  if ((gone.rowCount ?? 0) > 0) notes.push(`removed ${gone.rowCount} request notifications`);

  return notes;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const notes = await migrate(client);
    await client.query("commit");
    for (const note of notes) console.log(`- ${note}`);
    console.log(notes.length === 0 ? "Nothing to do: the database is already in the new shape." : `Done: ${notes.length} changes. Now run: npm run db:push`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error: unknown) => {
    console.error(`Failed, nothing was changed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
