// Projects and goals (docs/PLAN.md §6): Morgan creates a goal, a project under it (goal preselected) and a task
// from the project page (project preselected); progress rolls up to both; edit, pause, reactivate and achieve
// the goal; complete, archive and reactivate the project; a member reads without management controls; a
// stakeholder is redirected or gets Not found; another workspace sees nothing by id or in its lists.
//
// Usage: node scripts/test-walkthrough/07-planning.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const stamp = Date.now().toString(36);
const GOAL = `Walkthrough goal ${stamp}`;
const PROJECT = `Walkthrough project ${stamp}`;
const TASK = `Walkthrough task ${stamp}`;
const browsers = {};

const value = (browser, selector) => browser.evaluate(`document.querySelector(${JSON.stringify(selector)})?.value ?? null`);
const hasBar = (browser) => browser.evaluate(`!!document.querySelector("#quick-add-title")`);
const hasButton = (browser, pattern) =>
  browser.evaluate(`[...document.querySelectorAll("main button")].some((b) => b.offsetParent !== null && ${pattern}.test(b.textContent.trim()))`);

let goalPath = null;
let projectPath = null;

try {
  const lead = (browsers.lead = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await lead.goto("/goals", 4000);
  step("leader sees Goals", await lead.waitFor("What the team is working towards"));
  await lead.click("New goal");
  step("the goal dialog opens", await lead.waitFor("Say what success looks like"));
  step("the owner defaults to someone", (await value(lead, "#goal-owner")) !== "");
  await lead.type("#goal-title", GOAL);
  await lead.type("#goal-criteria", "Every walkthrough step passes.");
  await lead.click("Create goal", { exact: true });
  step("creating a goal shows the toast", await lead.waitFor("Goal created."));
  // By id from the database rather than the toast's Open button: synthetic pointer events on sonner's swipe
  // handler raise setPointerCapture errors that have nothing to do with the app.
  const [goalRow] = await query("select id from goals where title = $1", [GOAL]);
  step("the goal is in the database", Boolean(goalRow?.id));
  goalPath = `/goals/${goalRow.id}`;
  await lead.goto(goalPath, 3500);
  step("the goal page shows its title and an empty progress line", (await lead.waitFor(GOAL)) && (await lead.has("No tasks yet")));
  await lead.shot("07-goal-new");

  await lead.click("New project");
  step("the project dialog opens from the goal page", await lead.waitFor("A project groups related tasks"));
  step("the goal is preselected", (await value(lead, "#project-goal")) === goalPath.split("/").pop());
  await lead.type("#project-name", PROJECT);
  await lead.click("Create project", { exact: true });
  step("creating a project shows the toast", await lead.waitFor("Project created."));
  step("the goal page lists the project", await lead.waitFor(PROJECT));
  const [projectRow] = await query("select id from projects where name = $1", [PROJECT]);
  step("the project is in the database", Boolean(projectRow?.id));
  projectPath = `/projects/${projectRow.id}`;
  await lead.goto(projectPath, 3500);
  step("the project starts empty", await lead.waitFor("No tasks in this project yet."));

  step("the project page has the add bar", await hasBar(lead));
  await sleep(1500);
  step("the project is preselected", (await value(lead, "#quick-add-project")) === projectPath.split("/").pop());
  await lead.type("#quick-add-title", TASK);
  await lead.click("Add task", { exact: true });
  step("creating a task shows the toast", await lead.waitFor("Task created."));
  step("the project lists the task and counts it", (await lead.waitFor(TASK)) && (await lead.waitFor("of 1 task completed")));
  await lead.shot("07-project-with-task");

  await lead.goto(goalPath, 3500);
  step("the goal counts the task through its project", (await lead.waitFor("of 1 task completed")) && (await lead.has(TASK)));

  await lead.click("Edit", { exact: true });
  step("Edit starts from the current title", (await value(lead, "#goal-title")) === GOAL);
  await lead.type("#goal-title", `${GOAL} edited`);
  await lead.click("Save goal", { exact: true });
  step("saving the goal shows the toast and the new title", (await lead.waitFor("Goal saved.")) && (await lead.waitFor(`${GOAL} edited`)));

  await lead.click("Pause", { exact: true });
  step("pausing shows the badge", (await lead.waitFor("Goal paused.")) && (await lead.waitFor("Paused")));
  await sleep(800);
  step("a paused goal offers no add bar", !(await hasBar(lead)));
  await lead.click("Reactivate", { exact: true });
  step("reactivating works", await lead.waitFor("Goal is active again."));
  await lead.click("Mark achieved", { exact: true });
  step("achieving works", await lead.waitFor("Goal marked achieved."));
  await lead.goto("/goals", 3000);
  step("an achieved goal is hidden by default", !(await lead.has(`${GOAL} edited`)));
  await lead.goto("/goals?all=1", 3000);
  step("and shown with ?all=1", await lead.waitFor(`${GOAL} edited`));
  await lead.goto(goalPath, 3000);
  await lead.click("Reactivate", { exact: true });
  step("an achieved goal can be reactivated", await lead.waitFor("Goal is active again."));

  await lead.goto(projectPath, 3000);
  await lead.click("Mark completed", { exact: true });
  step("completing a project works", await lead.waitFor("Project marked completed."));
  await sleep(800);
  step("a completed project offers no add bar", !(await hasBar(lead)));
  await lead.click("Archive", { exact: true });
  step("archiving shows the banner and keeps the task", (await lead.waitFor("This project is archived. Its tasks stay readable.")) && (await lead.has(TASK)));
  await lead.shot("07-project-archived");
  await lead.goto("/projects", 3000);
  step("an archived project is hidden by default", !(await lead.has(PROJECT)));
  await lead.goto(projectPath, 3000);
  await lead.click("Reactivate", { exact: true });
  step("an archived project can be reactivated", await lead.waitFor("Project is active again."));
  step("no console errors for the leader", lead.problems.length === 0, JSON.stringify(lead.problems.slice(0, 2)));

  const member = (browsers.member = await openBrowser({ role: "member", width: 1280, height: 900 }));
  await member.goto("/goals", 4000);
  step("a member sees Goals without New goal", (await member.waitFor("What the team is working towards")) && !(await hasButton(member, "/New goal/")));
  await member.goto(goalPath, 3500);
  step("a member reads the goal without Edit or status actions", (await member.waitFor(`${GOAL} edited`)) && !(await hasButton(member, "/^(Edit|Mark achieved|Pause|New project)$/")));
  step("a member may still add a task to the goal", await hasBar(member));
  await member.goto(projectPath, 3500);
  step("a member reads the project without management controls", (await member.waitFor(PROJECT)) && !(await hasButton(member, "/^(Edit|Mark completed|Archive)$/")));
  await member.shot("07-member-project");

  const stakeholder = (browsers.stakeholder = await openBrowser({ role: "stakeholder", width: 1280, height: 900 }));
  await stakeholder.goto("/goals", 4000);
  step("a stakeholder is sent home from /goals", await stakeholder.waitForPath("/home"));
  await stakeholder.goto("/projects", 3500);
  step("a stakeholder is sent home from /projects", await stakeholder.waitForPath("/home"));
  await stakeholder.goto(goalPath, 3500);
  step("a stakeholder gets Not found for a goal by id", await stakeholder.waitFor("Not found"));
  await stakeholder.goto(projectPath, 3500);
  step("a stakeholder gets Not found for a project by id", await stakeholder.waitFor("Not found"));

  const other = (browsers.other = await openBrowser({ role: "other", width: 1280, height: 900 }));
  await other.goto(goalPath, 4000);
  step("another workspace gets Not found for the goal", await other.waitFor("Not found"));
  await other.goto(projectPath, 3500);
  step("another workspace gets Not found for the project", await other.waitFor("Not found"));
  await other.goto("/goals?all=1", 3500);
  step("another workspace's goals show none of ours", (await other.waitFor("Goals")) && !(await other.has("Walkthrough goal")) && !(await other.has("Ship the self-serve onboarding")));
} catch (error) {
  await stoppedOn(error, "07", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
