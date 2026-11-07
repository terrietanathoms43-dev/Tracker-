// Projects and goals, the funnel (docs/PLAN.md §6, 2026-11-03 log): Morgan creates a project, a goal inside it
// from the project page (project preselected), a task from the goal page (project and goal preselected); progress
// rolls up to both; the goal is connected to another and shows on the branch view; the navigation's project picker
// narrows the task list and the goals; edit, pause, reactivate and complete the goal; complete, archive and
// reactivate the project; a member reads without management controls; a stakeholder reads too; another workspace
// sees nothing by id or in its lists.
//
// Usage: node scripts/test-walkthrough/07-planning.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, pickChoice, pickedValue, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const stamp = Date.now().toString(36);
const PROJECT = `Walkthrough project ${stamp}`;
const GOAL = `Walkthrough goal ${stamp}`;
const TASK = `Walkthrough task ${stamp}`;
const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";

const value = pickedValue;
const hasBar = (browser) => browser.evaluate(`!!document.querySelector("#quick-add-title")`);
/** The page refreshes behind a status change; the add bar goes once the new render lands, up to a few seconds later. */
const barGone = async (browser) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!(await hasBar(browser))) return true;
    await sleep(300);
  }
  return false;
};
const hasButton = (browser, pattern) =>
  browser.evaluate(`[...document.querySelectorAll("main button")].some((b) => b.offsetParent !== null && ${pattern}.test(b.textContent.trim()))`);

let goalPath = null;
let projectPath = null;

try {
  const lead = (browsers.lead = await openBrowser({ role: "leader", width: 1280, height: 900 }));

  // --- 1. a project, then a goal inside it ------------------------------------------------------------------------
  await lead.goto("/home?view=projects", 4000);
  step("leader sees Projects", await lead.waitFor("The top of the funnel"));
  await lead.click("New project");
  step("the project dialog opens", await lead.waitFor("A project holds goals"));
  await lead.type("#project-name", PROJECT);
  await lead.click("Create project", { exact: true });
  step("creating a project shows the toast", await lead.waitFor("Project created."));
  const [projectRow] = await query("select id from projects where name = $1", [PROJECT]);
  step("the project is in the database", Boolean(projectRow?.id));
  projectPath = `/projects/${projectRow.id}`;
  await lead.goto(projectPath, 3500);
  step("the project page starts with no goals and no tasks", (await lead.waitFor("No goals yet")) && (await lead.has("No tasks in this project yet.")));

  await lead.click("New goal", { exact: true });
  step("the goal dialog opens from the project page", await lead.waitFor("A goal lives in a project"));
  step("the project is preselected", (await value(lead, "#goal-project")) === projectRow.id);
  await lead.type("#goal-title", GOAL);
  await lead.type("#goal-criteria", "Every walkthrough step passes.");
  await lead.click("Create goal", { exact: true, within: "[role=dialog]" });
  step("creating a goal shows the toast", await lead.waitFor("Goal created."));
  const [goalRow] = await query("select id, project_id from goals where title = $1", [GOAL]);
  step("the goal is in the database, in the project", goalRow?.project_id === projectRow.id, JSON.stringify(goalRow));
  goalPath = `/goals/${goalRow.id}`;
  step("the project page lists the goal", await lead.waitFor(GOAL));
  await lead.shot("07-project-with-goal");

  // --- 2. a task from the goal page ------------------------------------------------------------------------------------
  await lead.goto(goalPath, 3500);
  step("the goal page shows its title and its project, with no task of its own yet", (await lead.waitFor(GOAL)) && (await lead.has(PROJECT)) && !(await lead.has("Everything completed")));
  step("the goal page has the add bar", await hasBar(lead));
  await sleep(1500);
  step("the project and the goal are preselected", (await value(lead, "#quick-add-project")) === projectRow.id && (await value(lead, "#quick-add-goal")) === goalRow.id);
  await lead.type("#quick-add-title", TASK);
  await lead.click("Add task", { exact: true });
  step("creating a task shows the toast", await lead.waitFor("Task created."));
  const [taskRow] = await query("select project_id, goal_id from tasks where title = $1", [TASK]);
  step("the task is in the goal and in the goal's project", taskRow?.goal_id === goalRow.id && taskRow?.project_id === projectRow.id, JSON.stringify(taskRow));
  step("the goal lists the task and counts it", (await lead.waitFor(TASK)) && (await lead.waitFor("of 1 task completed")));
  await lead.goto(projectPath, 3500);
  step("the project counts the task too", (await lead.waitFor("of 1 task completed")) && (await lead.has(TASK)));

  // --- 3. connections and the branch view ---------------------------------------------------------------------------------
  const [other] = await query(`select id, title from goals where org_id = (${org}) and status = 'active' and parent_goal_id is null and title = 'Cut incident response time in half'`);
  await lead.goto(goalPath, 3500);
  await lead.click("Edit connections", { exact: true, wait: 1000 });
  step("the connections dialog opens", await lead.waitFor("Connect this goal"));
  await lead.click(other.title, { within: "[role=dialog]", wait: 400 });
  await lead.click("Save connections", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("saving shows the toast", await lead.waitFor("Connections saved."));
  step("the goal page says what it comes after", await lead.waitForNear("Comes after", other.title));
  const [link] = await query("select from_goal_id from goal_links where to_goal_id = $1", [goalRow.id]);
  step("the link is in the database", link?.from_goal_id === other.id);
  await lead.goto("/goals?view=branches", 4000);
  step("the branch view draws the goal as a node with an arrow into it", (await lead.waitFor(GOAL)) && (await lead.evaluate(`document.querySelector('[data-goal-node="${goalRow.id}"]') !== null && document.querySelectorAll('[data-edge="link"]').length > 0`)) === true);
  await lead.shot("07-branch-view", { full: true });

  // --- 4. the navigation's project picker narrows the screens -----------------------------------------------------------
  await lead.goto("/home?view=list", 4000);
  step("the navigation's project picker finds the project by search", await pickChoice(lead, "[data-project-scope]", PROJECT));
  step("choosing the project in the navigation narrows the list to it", (await lead.waitFor(`In ${PROJECT}`)) && (await lead.has(TASK)) && !(await lead.has("Route pages to the secondary on-call")));
  await lead.goto("/goals", 4000);
  step("the goals page follows the picker", (await lead.waitFor(`What ${PROJECT} is working towards`)) && (await lead.has(GOAL)) && !(await lead.has("Ship the self-serve onboarding")));
  await pickChoice(lead, "[data-project-scope]", "All projects", { search: "" });
  step("All projects brings everything back", await lead.waitFor("Ship the self-serve onboarding"));

  // --- 5. edit, pause, complete, reopen ---------------------------------------------------------------------------------
  await lead.goto(goalPath, 3500);
  await lead.click("Edit", { exact: true });
  step("Edit starts from the current title", (await value(lead, "#goal-title")) === GOAL);
  await lead.type("#goal-title", `${GOAL} edited`);
  await lead.click("Save goal", { exact: true });
  step("saving the goal shows the toast and the new title", (await lead.waitFor("Goal saved.")) && (await lead.waitFor(`${GOAL} edited`)));
  await lead.click("Pause", { exact: true });
  step("pausing shows the badge", (await lead.waitFor("Goal paused.")) && (await lead.waitFor("Paused")));
  step("a paused goal offers no add bar", await barGone(lead));
  await lead.click("Reactivate", { exact: true });
  step("reactivating works", await lead.waitFor("Goal is active again."));
  await lead.click("Mark completed", { exact: true, wait: 2500 });
  step("marking it completed with its task still open is refused", await lead.waitFor("Finish the 1 open task"));
  const [taskId] = await query("select id from tasks where title = $1", [TASK]);
  await lead.goto(`/tasks/${taskId.id}`, 4000);
  await lead.waitFor("Next action");
  await lead.click("Change status", { wait: 800 });
  await lead.click("Completed", { exact: true, within: "[role=menu]", wait: 1500 });
  await lead.waitFor("Mark as completed", 5000);
  await lead.type("#transition-summary", "Every walkthrough step passed.");
  await lead.click("Mark as completed", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("completing its last task achieves the goal", await lead.waitFor("is achieved", 10_000));
  const [achievedGoal] = await query("select status from goals where id = $1", [goalRow.id]);
  step("the goal is completed in the database", achievedGoal?.status === "completed", JSON.stringify(achievedGoal));
  await lead.goto("/goals", 3000);
  step("a completed goal is hidden by default", !(await lead.has(`${GOAL} edited`)));
  await lead.goto("/goals?all=1", 3000);
  step("and shown with ?all=1", await lead.waitFor(`${GOAL} edited`));
  await lead.goto(goalPath, 3000);
  await lead.click("Reopen", { exact: true });
  step("a completed goal can be reopened", await lead.waitFor("Goal is active again."));

  // --- 6. the project's own states --------------------------------------------------------------------------------------
  await lead.goto(projectPath, 3000);
  await lead.click("Mark completed", { exact: true });
  step("completing a project works", await lead.waitFor("Project marked completed."));
  step("a completed project offers no add bar", await barGone(lead));
  await lead.click("Archive", { exact: true });
  const [kept] = await query("select project_id from tasks where title = $1", [TASK]);
  step("archiving shows the banner and keeps the task", (await lead.waitFor("This project is archived.")) && kept?.project_id === projectRow.id, JSON.stringify(kept));
  await lead.shot("07-project-archived");
  await lead.goto("/home?view=projects", 3000);
  const listsProject = () => lead.evaluate(`[...document.querySelectorAll("main a")].some((a) => a.textContent.trim() === ${JSON.stringify(PROJECT)})`);
  step("an archived project is hidden by default", (await lead.waitFor("Show completed and archived")) && !(await listsProject()));
  await lead.goto("/home?view=projects&all=1", 3000);
  const shown = await (async () => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (await listsProject()) return true;
      await sleep(300);
    }
    return false;
  })();
  step("and shown with ?all=1", shown);
  await lead.goto(projectPath, 3000);
  await lead.click("Reactivate", { exact: true });
  step("an archived project can be reactivated", await lead.waitFor("Project is active again."));
  step("no console errors for the leader", lead.problems.length === 0, JSON.stringify(lead.problems.slice(0, 2)));

  // --- 7. who reads what -----------------------------------------------------------------------------------------------
  const member = (browsers.member = await openBrowser({ role: "member", width: 1280, height: 900 }));
  await member.goto("/goals", 4000);
  step("a member sees Goals without New goal", (await member.waitFor("What the team is working towards")) && !(await hasButton(member, "/New goal/")));
  await member.goto(goalPath, 3500);
  step("a member reads the goal without Edit or status actions", (await member.waitFor(`${GOAL} edited`)) && !(await hasButton(member, "/^(Edit|Mark completed|Pause|Edit connections)$/")));
  step("a member may still add a task to the goal", await hasBar(member));
  await member.goto(projectPath, 3500);
  step("a member reads the project without management controls", (await member.waitFor(PROJECT)) && !(await hasButton(member, "/^(Edit|Mark completed|Archive|New goal)$/")));
  await member.shot("07-member-project");

  const stakeholder = (browsers.stakeholder = await openBrowser({ role: "stakeholder", width: 1280, height: 900 }));
  await stakeholder.goto("/goals", 4000);
  step("a stakeholder reads the goals", await stakeholder.waitFor("What the team is working towards"));
  await stakeholder.goto(goalPath, 3500);
  step("a stakeholder reads a goal with Mark completed and nothing else", (await stakeholder.waitFor(`${GOAL} edited`)) && (await hasButton(stakeholder, "/^Mark completed$/")) && !(await hasButton(stakeholder, "/^(Edit|Pause|New sub-goal)$/")));

  const otherWs = (browsers.other = await openBrowser({ role: "other", width: 1280, height: 900 }));
  await otherWs.goto(goalPath, 4000);
  step("another workspace gets Not found for the goal", await otherWs.waitFor("Not found"));
  await otherWs.goto(projectPath, 3500);
  step("another workspace gets Not found for the project", await otherWs.waitFor("Not found"));
  await otherWs.goto("/goals?all=1", 3500);
  step("another workspace's goals show none of ours", (await otherWs.waitFor("Goals")) && !(await otherWs.has("Walkthrough goal")) && !(await otherWs.has("Ship the self-serve onboarding")));
} catch (error) {
  await stoppedOn(error, "07", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
