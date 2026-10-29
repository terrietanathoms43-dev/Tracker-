// What each role may NOT do (docs/PLAN.md §3): a stakeholder is sent home from the work screens and gets Not found
// for anything but the task made from her own request; a member sees no decision or planning controls; a leader
// cannot invite an admin or delete the workspace; another workspace sees nothing of Trackwise Demo by id, in a
// list, or in a CSV export.
//
// Usage: node scripts/test-walkthrough/05-roles.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, step, stoppedOn } from "./lib.mjs";

const browsers = {};

const buttonTexts = (browser) =>
  browser.evaluate(`[...document.querySelectorAll("main button")].filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim())`);
const DECISION_BUTTONS = /^(Decide|Approve|Defer|Defer again|Reject|Reopen|Convert to task)$/;
const PLANNING_BUTTONS = /^(New goal|New project|Edit|Mark achieved|Pause|Mark completed|Archive)$/;

/** Seeded rows of Trackwise Demo, looked up rather than hard-coded so the script survives a reseed. */
async function demoRows() {
  const one = async (sql) => (await query(sql))[0];
  const org = "select id from organizations where slug = 'trackwise-demo'";
  return {
    plainTask: await one(`select id, title from tasks where org_id = (${org}) and request_id is null and status = 'in_progress' order by created_at limit 1`),
    awaitingTask: await one(`select id from tasks where org_id = (${org}) and status = 'awaiting_approval' limit 1`),
    convertedTask: await one(
      `select t.id from tasks t join requests r on r.converted_task_id = t.id join users u on u.id = r.requester_id where t.org_id = (${org}) and u.email = 'taylor@trackwise.test' limit 1`,
    ),
    goal: await one(`select id from goals where org_id = (${org}) and status = 'active' limit 1`),
    project: await one(`select id from projects where org_id = (${org}) and status = 'active' limit 1`),
    othersRequest: await one(`select r.id from requests r join users u on u.id = r.requester_id where r.org_id = (${org}) and u.email <> 'taylor@trackwise.test' limit 1`),
    completedTitle: (await one(`select title from tasks where org_id = (${org}) and status = 'completed' order by completed_at desc limit 1`))?.title,
  };
}

try {
  const rows = await demoRows();
  step("the seed has every row the checks need", Object.values(rows).every(Boolean), JSON.stringify(Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, Boolean(v)]))));

  // --- stakeholder ------------------------------------------------------------------------------------------------
  const taylor = (browsers.taylor = await openBrowser({ role: "stakeholder", width: 390, height: 844 }));
  for (const path of ["/home?view=list", "/my-work", "/goals", "/projects", "/members", "/reports"]) {
    await taylor.goto(path, 4000);
    step(`a stakeholder asking for ${path} is sent home`, (await taylor.path()).startsWith("/home"), await taylor.path());
  }
  await taylor.goto(`/tasks/${rows.convertedTask.id}`, 6000);
  step("a stakeholder reads the task made from her request", await taylor.waitFor("Next action"));
  step("with no update form, comment box or status menu", !(await taylor.has("Save update")) && !(await taylor.has("Add a comment")) && !(await taylor.evaluate(`!!document.querySelector('[aria-label="Change status"]')`)));
  await taylor.shot("05-stakeholder-task");
  for (const [label, path] of [
    ["another task", `/tasks/${rows.plainTask.id}`],
    ["a goal", `/goals/${rows.goal.id}`],
    ["a project", `/projects/${rows.project.id}`],
    ["someone else's request", `/requests/${rows.othersRequest.id}`],
  ]) {
    await taylor.goto(path, 5000);
    step(`a stakeholder gets Not found for ${label}`, await taylor.waitFor("Not found"));
  }

  // --- member ------------------------------------------------------------------------------------------------------
  const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 1280, height: 900 }));
  await jordan.goto("/requests", 5000);
  step("a member sees requests without decision controls", (await jordan.waitFor("Requests")) && !(await buttonTexts(jordan)).some((text) => DECISION_BUTTONS.test(text)));
  await jordan.goto("/goals", 5000);
  step("a member sees goals without New goal", (await jordan.waitFor("Goals")) && !(await buttonTexts(jordan)).some((text) => PLANNING_BUTTONS.test(text)));
  await jordan.goto(`/projects/${rows.project.id}`, 5000);
  step("a member reads a project without Edit or status actions", (await jordan.waitFor("Tasks")) && !(await buttonTexts(jordan)).some((text) => PLANNING_BUTTONS.test(text)));
  await jordan.goto("/settings/workspace", 5000);
  step("a member cannot change roles, invite or delete", (await jordan.waitFor("Members")) && (await jordan.evaluate(`document.querySelectorAll("select[aria-label^='Role for']").length`)) === 0 && !(await jordan.has("Send invitations")) && !(await jordan.has("Delete workspace")));
  await jordan.goto(`/tasks/${rows.awaitingTask.id}`, 5000);
  step("a member who is not the approver sees no Approve button", (await jordan.waitFor("Next action")) && !(await buttonTexts(jordan)).some((text) => text === "Approve"));
  await jordan.goto("/members", 5000);
  step("a member reads the Members page without New team or Invite people", (await jordan.waitFor("Frontend")) && !(await buttonTexts(jordan)).some((text) => /^(New team|Invite people)$/.test(text)));

  // --- leader -----------------------------------------------------------------------------------------------------
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await morgan.goto("/settings/workspace", 5000);
  const roles = await morgan.evaluate(`[...document.querySelectorAll("#invite-role option")].map((o) => o.value)`);
  step("a leader cannot invite an admin", Array.isArray(roles) && roles.length > 0 && !roles.includes("admin"), String(roles));
  step("a leader cannot delete the workspace or change roles", !(await morgan.has("Delete workspace")) && (await morgan.evaluate(`document.querySelectorAll("select[aria-label^='Role for']").length`)) === 0);
  await morgan.goto(`/tasks/${rows.awaitingTask.id}`, 5000);
  step("a leader sees the approval controls", (await morgan.waitFor("Approve")) && (await morgan.has("Send back")));

  // --- another workspace ------------------------------------------------------------------------------------------
  const riley = (browsers.riley = await openBrowser({ role: "other", width: 1280, height: 900 }));
  for (const [label, path] of [
    ["a task", `/tasks/${rows.plainTask.id}`],
    ["a goal", `/goals/${rows.goal.id}`],
    ["a project", `/projects/${rows.project.id}`],
    ["a request", `/requests/${rows.othersRequest.id}`],
  ]) {
    await riley.goto(path, 5000);
    step(`another workspace gets Not found for ${label}`, await riley.waitFor("Not found"));
  }
  await riley.goto("/home?view=list&closed=1", 5000);
  step("another workspace's task list holds none of ours", (await riley.waitFor("Tasks")) && !(await riley.has(rows.plainTask.title)) && !(await riley.has(rows.completedTitle)));
  const csv = await riley.evaluate(`fetch("/reports/export?table=delivered").then((r) => r.text())`);
  step("another workspace's CSV export holds none of ours", typeof csv === "string" && !csv.includes(rows.completedTitle), (csv ?? "").slice(0, 80));
  await riley.goto("/members", 5000);
  step("another workspace's Members page shows only its own people and teams", (await riley.waitFor("Members")) && !(await riley.has("Jordan Dev")) && !(await riley.has("Frontend")) && (await riley.has("Casey Other")));
} catch (error) {
  await stoppedOn(error, "05", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  finish();
}
