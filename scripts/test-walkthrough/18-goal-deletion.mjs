// Regression: deleting a goal deletes its generated "Everything completed" task, but leaves every
// ordinary task in its project without a goal. Exercise the real UI action and verify persisted rows.
// Usage: node scripts/test-walkthrough/18-goal-deletion.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, step, stoppedOn, tidy } from "./lib.mjs";

const stamp = Date.now().toString(36);
const GOAL = `Walkthrough delete goal ${stamp}`;
const TASK = `Walkthrough orphan task ${stamp}`;
const browsers = {};

try {
  const [project] = await query(
    "select p.id from projects p join organizations o on o.id = p.org_id where o.slug = 'trackwise-demo' and p.status = 'active' order by p.created_at limit 1",
  );
  step("the test workspace has an active project", Boolean(project?.id));

  const lead = (browsers.lead = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await lead.goto(`/projects/${project.id}`, 3500);
  await lead.click("New goal", { exact: true });
  await lead.type("#goal-title", GOAL);
  await lead.click("Create goal", { exact: true, within: "[role=dialog]", wait: 2000 });
  step("the goal was created", await lead.waitFor("Goal created."));

  const [goal] = await query("select id, project_id from goals where title = $1", [GOAL]);
  step("the goal belongs to the selected project", goal?.project_id === project.id);

  const [closer] = await query("select id from tasks where goal_id = $1 and goal_closer = true", [goal.id]);
  step("a generated Everything completed task exists", Boolean(closer?.id));

  await lead.goto(`/goals/${goal.id}`, 3500);
  await lead.type("#quick-add-text", TASK);
  await lead.click("Add task", { exact: true });
  step("the regular task was created", await lead.waitFor("Task created."));
  const [ordinary] = await query("select id, project_id, goal_id, goal_closer from tasks where title = $1", [TASK]);
  step("the ordinary task belongs to the goal", ordinary?.goal_id === goal.id && ordinary?.goal_closer === false);

  await lead.clickSelector("[data-delete-goal]");
  step("the dialog warns that the closer is removed and other tasks remain", (await lead.waitFor("Delete this goal?")) && (await lead.has("Its “Everything completed” task goes with it.")));
  await lead.click("Delete goal", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("the deletion succeeds", await lead.waitFor("Goal deleted."));

  const deletedGoal = await query("select id from goals where id = $1", [goal.id]);
  const deletedCloser = await query("select id from tasks where id = $1", [closer.id]);
  const [orphan] = await query("select id, project_id, goal_id, goal_closer from tasks where id = $1", [ordinary.id]);
  step("the goal is deleted", deletedGoal.length === 0);
  step("the generated Everything completed task is deleted, not orphaned", deletedCloser.length === 0);
  step("the ordinary task survives as an orphan in the same project", orphan?.id === ordinary.id && orphan?.goal_id === null && orphan?.project_id === project.id && orphan?.goal_closer === false);

  const [history] = await query(
    "select note from task_activity where task_id = $1 and kind = 'edited' and note like '%was deleted%' order by created_at desc limit 1",
    [ordinary.id],
  );
  step("the orphan's activity history records why its goal was removed", Boolean(history?.note));

  await lead.goto(`/projects/${project.id}`, 3500);
  step("the project still displays the ordinary task", await lead.waitFor(TASK));
  step("no console errors during deletion", lead.problems.length === 0, JSON.stringify(lead.problems.slice(0, 2)));
} catch (error) {
  await stoppedOn(error, "18", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
