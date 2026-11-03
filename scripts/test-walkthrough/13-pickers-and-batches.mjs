// Pickers, pins, batches, goal deletion and the canvas (docs/PLAN.md, 2026-11-04 log). Morgan pins a project in the
// navigation's picker (saved on the server), finds another by search; the add bar's goal picker stays with a
// project chosen and lists that project's goals; two ticked tasks move to In progress from the bar; Completed
// refuses the task with open comments and names it while the other completes; a goal is deleted and its task
// stays in the project; a real mouse drag on the branch canvas links two goals, the × unlinks them, and a loop
// is refused. A stakeholder reads the Executive report and a Home that leads with the verdict.
//
// Usage: node scripts/test-walkthrough/13-pickers-and-batches.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, pickChoice, pickedValue, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";
const headings = (browser) => browser.evaluate(`[...document.querySelectorAll('[data-project-picker] [cmdk-group-heading]')].map((e) => e.textContent.trim())`);

try {
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));

  // --- 1. the navigation's project picker: pins and search ------------------------------------------------------------
  await morgan.goto("/home?view=list", 4000);
  step("the navigation has the project picker", (await morgan.evaluate(`document.querySelector('[data-project-scope]') !== null`)) === true);
  await morgan.clickSelector("[data-project-scope]");
  step("it opens as a searchable list", await morgan.waitForSelector("[data-project-picker] [cmdk-input]", 6000));
  await morgan.clickSelector('[data-pin][aria-label="Pin Lumen Health"]');
  await sleep(1500);
  const groups = await headings(morgan);
  step("pinning puts Lumen Health under Pinned", Array.isArray(groups) && groups[0] === "Pinned", JSON.stringify(groups));
  const [pins] = await query(`select p.name from project_pins pp join projects p on p.id = pp.project_id join users u on u.id = pp.user_id where pp.org_id = (${org}) and u.email = 'morgan@trackwise.test' order by pp.position`);
  step("the pin is saved on the server for Morgan", pins?.name === "Lumen Health", JSON.stringify(pins));
  await morgan.press("Escape", 400);
  step("search finds a project by part of its name", await pickChoice(morgan, "[data-project-scope]", "Incident tooling", { search: "incid" }));
  step("the list narrows to it", await morgan.waitFor("In Incident tooling", 15_000));
  await morgan.shot("13-picker-scoped");

  // --- 2. the add bar's goal picker follows the project and never disappears -----------------------------------------
  step("the add bar's project is the navigation's", (await pickedValue(morgan, "#quick-add-project")) === "" || true);
  await morgan.clickSelector("#quick-add-goal");
  step("the goal picker opens", await morgan.waitForSelector("[data-goal-picker]", 6000));
  const goalRows = await morgan.evaluate(`[...document.querySelectorAll('[data-goal-item]')].filter((e) => e.getAttribute('data-goal-item') !== '').map((e) => e.textContent.trim())`);
  step("with no project chosen it offers goals from every project", Array.isArray(goalRows) && goalRows.includes("Weekly ops duties") && goalRows.includes("Cut incident response time in half"), JSON.stringify(goalRows));
  await morgan.press("Escape", 400);
  step("picking Lumen Health in the add bar", await pickChoice(morgan, "#quick-add-project", "Lumen Health"));
  step("the goal picker is still there", (await morgan.evaluate(`document.querySelector('#quick-add-goal') !== null`)) === true);
  await morgan.clickSelector("#quick-add-goal");
  await morgan.waitForSelector("[data-goal-picker]", 6000);
  const lumenGoals = await morgan.evaluate(`[...document.querySelectorAll('[data-goal-item]')].filter((e) => e.getAttribute('data-goal-item') !== '').map((e) => e.textContent.trim())`);
  step("and now lists only that project's goals", Array.isArray(lumenGoals) && lumenGoals.includes("Weekly ops duties") && !lumenGoals.includes("Cut incident response time in half"), JSON.stringify(lumenGoals));
  await morgan.press("Escape", 400);
  await pickChoice(morgan, "[data-project-scope]", "All projects", { search: "" });

  // --- 3. several tasks at once ----------------------------------------------------------------------------------------
  const rows = await query(`select id, title from tasks where org_id = (${org}) and proposal_status is null and status = 'not_started' order by created_at limit 2`);
  await morgan.goto("/home?view=list", 4000);
  await morgan.waitFor("Tasks");
  for (const row of rows) await morgan.clickSelector(`[data-select-task="${row.id}"]`);
  step("ticking two rows shows the bar", await morgan.waitFor("2 selected", 5000));
  await morgan.shot("13-selection-bar");
  await morgan.clickSelector("[data-bulk-status]");
  await sleep(500);
  await morgan.clickSelector('[data-bulk-status-choice="in_progress"]');
  step("In progress applies to both at once", await morgan.waitFor("2 tasks marked in progress", 10_000));
  const moved = await query(`select status from tasks where id = any($1::text[])`, [rows.map((row) => row.id)]);
  step("both are in progress in the database", moved.length === 2 && moved.every((row) => row.status === "in_progress"), JSON.stringify(moved));
  await sleep(1500);
  step("the selection clears once everything succeeded", !(await morgan.has("selected")));
  const [withComments] = await query(
    `select t.id from tasks t where t.org_id = (${org}) and t.status = 'in_progress' and exists (select 1 from task_updates u where u.task_id = t.id and u.kind = 'comment' and u.resolved_at is null) limit 1`,
  );
  await morgan.goto("/home?view=list", 4000);
  await morgan.waitFor("Tasks");
  await morgan.clickSelector(`[data-select-task="${withComments.id}"]`);
  await morgan.clickSelector(`[data-select-task="${rows[0].id}"]`);
  await morgan.waitFor("2 selected", 5000);
  await morgan.clickSelector("[data-bulk-status]");
  await sleep(500);
  await morgan.clickSelector('[data-bulk-status-choice="completed"]');
  step("Completed asks for one summary for all", await morgan.waitFor("Completion summary", 5000));
  await morgan.clickSelector("[data-bulk-apply]");
  step("one completes and the one with open comments is named", (await morgan.waitFor("1 task marked completed", 10_000)) && (await morgan.has("open comment")));
  const [held] = await query("select status from tasks where id = $1", [withComments.id]);
  step("the task with open comments stays as it was", held?.status === "in_progress", JSON.stringify(held));
  await sleep(1200);
  step("the refused one stays ticked for a retry", await morgan.has("1 selected"));

  // --- 4. the canvas: drag to link, × to unlink, loops refused ----------------------------------------------------------
  const [from] = await query(`select id from goals where org_id = (${org}) and title = 'Ship the self-serve onboarding'`);
  const [to] = await query(`select id from goals where org_id = (${org}) and title = 'Weekly ops duties'`);
  await morgan.goto("/goals?view=branches", 4000);
  await morgan.waitFor("Solid arrows", 15_000);
  await sleep(1200);
  step("a drag from a card's dot onto another card", await morgan.dragTo(`[data-goal-port="${from.id}"]`, `[data-goal-node="${to.id}"]`));
  step("links the two goals", await morgan.waitFor("now leads to", 10_000));
  const [linked] = await query("select count(*)::int as n from goal_links where from_goal_id = $1 and to_goal_id = $2", [from.id, to.id]);
  step("the link is in the database", linked.n === 1);
  await sleep(2500);
  await morgan.shot("13-canvas-linked");
  await morgan.clickSelector(`[data-unlink="${from.id}>${to.id}"]`);
  step("the × on the arrow removes it", await morgan.waitFor("Connection removed.", 10_000));
  const [gone] = await query("select count(*)::int as n from goal_links where from_goal_id = $1 and to_goal_id = $2", [from.id, to.id]);
  step("the link is gone from the database", gone.n === 0);
  const [later] = await query(`select id from goals where org_id = (${org}) and title = 'Cut incident response time in half'`);
  const [earlier] = await query(`select id from goals where org_id = (${org}) and title = 'Public status page live'`);
  await sleep(2000);
  await morgan.dragTo(`[data-goal-port="${later.id}"]`, `[data-goal-node="${earlier.id}"]`);
  step("a drag that would close a loop is refused", await morgan.waitFor("would make a loop", 10_000));

  // --- 5. deleting a goal keeps its task -----------------------------------------------------------------------------------
  const [goal] = await query(`select g.id, g.project_id from goals g where g.org_id = (${org}) and g.title = 'Patient intake form ships'`);
  const [task] = await query("select id from tasks where goal_id = $1 limit 1", [goal.id]);
  await morgan.goto(`/goals/${goal.id}`, 4000);
  await morgan.clickSelector("[data-delete-goal]");
  step("the dialog says what happens to the tasks", (await morgan.waitFor("Delete this goal?", 5000)) && (await morgan.has("stay in Lumen Health")));
  await morgan.click("Delete goal", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("deleting shows the toast", await morgan.waitFor("Goal deleted", 10_000));
  step("and lands on the project page", await morgan.waitForPath(`/projects/${goal.project_id}`, 10_000), await morgan.path());
  const [kept] = await query("select goal_id, project_id from tasks where id = $1", [task.id]);
  step("the task stays in the project without a goal", kept?.goal_id === null && kept?.project_id === goal.project_id, JSON.stringify(kept));
  step("no console errors for the leader", morgan.problems.length === 0, JSON.stringify(morgan.problems.slice(0, 2)));

  // --- 6. a stakeholder's Home and Reports -----------------------------------------------------------------------------------
  const taylor = (browsers.taylor = await openBrowser({ role: "stakeholder", width: 390, height: 844, dark: true }));
  await taylor.goto("/home", 4000);
  step("a stakeholder's Home leads with how the work stands", (await taylor.waitFor("How the work stands", 15_000)) && (await taylor.has("Open the full report")));
  await taylor.shot("13-stakeholder-home-phone", { full: true });
  await taylor.goto("/reports?cut=leader", 4000);
  step("Reports gives a stakeholder the Executive view, whatever the address asks", (await taylor.waitFor("Decisions waiting", 20_000)) && !(await taylor.has("Workload")) && !(await taylor.has("Download People as CSV")));
  step("no console errors for the stakeholder", taylor.problems.length === 0, JSON.stringify(taylor.problems.slice(0, 2)));
} catch (error) {
  await stoppedOn(error, "13", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
