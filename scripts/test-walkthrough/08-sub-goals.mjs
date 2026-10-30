// Sub-goals (docs/PLAN.md, 2026-10-30 log): Morgan opens a goal and adds a sub-goal from its page; a target date
// after the parent's is refused with the parent's date named, an earlier one is accepted; a task added to the
// sub-goal counts for the sub-goal and rolls up into the parent; moving the parent's date before the sub-goal's is
// refused; the sub-goal page points back at its parent and offers no sub-goals of its own; a member reads it all
// without controls; another workspace gets Not found.
//
// Usage: node scripts/test-walkthrough/08-sub-goals.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const stamp = Date.now().toString(36);
const SUB_GOAL = `Walkthrough sub-goal ${stamp}`;
const TASK = `Walkthrough sub-goal task ${stamp}`;
const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";

const value = (browser, selector) => browser.evaluate(`document.querySelector(${JSON.stringify(selector)})?.value ?? null`);
const hasButton = (browser, pattern) =>
  browser.evaluate(`[...document.querySelectorAll("main button")].some((b) => b.offsetParent !== null && ${pattern}.test(b.textContent.trim()))`);
const shift = (day, days) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

try {
  const [parent] = await query(
    `select id, title, target_date::text as target from goals where org_id = (${org}) and status = 'active' and parent_goal_id is null and target_date is not null order by target_date limit 1`,
  );
  step("the seed has an active top-level goal with a target date", Boolean(parent?.id), parent?.title);
  const parentPath = `/goals/${parent.id}`;

  // --- 1. Morgan adds a sub-goal from the goal page --------------------------------------------------------------
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await morgan.goto(parentPath, 4000);
  step("the goal page has a Sub-goals section", (await morgan.waitFor(parent.title)) && (await morgan.has("Sub-goals")));
  await morgan.click("New sub-goal", { exact: true, wait: 1000 });
  step("the sub-goal dialog names the parent", await morgan.waitFor(`A step towards “${parent.title}”`));
  step("and tells the latest allowed date", await morgan.has("On or before"));
  await morgan.type("#goal-title", SUB_GOAL);
  await morgan.type("#goal-target", shift(parent.target, 7));
  await sleep(400);
  step("a date after the parent's is refused before saving", await morgan.waitFor("A sub-goal can't be due after its parent goal."));
  step("the Create button is held back", (await morgan.evaluate(`[...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.trim() === "Create sub-goal")?.disabled`)) === true);
  await morgan.type("#goal-target", shift(parent.target, -7));
  await sleep(400);
  step("a date before the parent's is accepted", !(await morgan.has("A sub-goal can't be due after its parent goal.")));
  await morgan.click("Create sub-goal", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("creating shows the toast", await morgan.waitFor("Sub-goal created."));
  const [sub] = await query("select id, parent_goal_id, target_date::text as target from goals where title = $1", [SUB_GOAL]);
  step("the sub-goal is in the database under its parent with the earlier date", sub?.parent_goal_id === parent.id && sub?.target === shift(parent.target, -7), JSON.stringify(sub));
  step("the parent page lists the sub-goal", await morgan.waitFor(SUB_GOAL));
  await morgan.shot("08-goal-with-sub-goal", { full: true });

  // --- 2. a task on the sub-goal rolls up into the parent -------------------------------------------------------------
  const [before] = await query(
    `select count(*)::int as n from tasks t where t.org_id = (${org}) and t.status <> 'rejected' and (t.goal_id = $1 or t.goal_id in (select id from goals where parent_goal_id = $1) or t.project_id in (select id from projects where goal_id = $1 or goal_id in (select id from goals where parent_goal_id = $1)))`,
    [parent.id],
  );
  const subPath = `/goals/${sub.id}`;
  await morgan.goto(subPath, 4000);
  step("the sub-goal page points back at its parent", (await morgan.waitFor(SUB_GOAL)) && (await morgan.has(parent.title)));
  step("a sub-goal offers no sub-goals of its own", !(await morgan.has("New sub-goal")) && !(await morgan.has("Sub-goals")));
  step("the sub-goal page has the add bar", await morgan.evaluate(`!!document.querySelector("#quick-add-title")`));
  await morgan.type("#quick-add-title", TASK);
  await morgan.click("Add task", { exact: true, wait: 2500 });
  step("adding a task shows the toast", await morgan.waitFor("Task created."));
  step("the sub-goal counts the task", await morgan.waitFor("of 1 task completed"));
  await morgan.goto(parentPath, 4000);
  step("the parent counts it too", await morgan.waitFor(`of ${before.n + 1} tasks completed`));
  step("and lists it among its tasks", await morgan.has(TASK));
  await morgan.shot("08-parent-rolls-up", { full: true });

  // --- 3. the parent's date can't move before the sub-goal's ---------------------------------------------------------------
  await morgan.click("Edit", { exact: true, wait: 1000 });
  step("Edit starts from the goal's title", (await value(morgan, "#goal-title")) === parent.title);
  await morgan.type("#goal-target", shift(sub.target, -1));
  await morgan.click("Save goal", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("a parent date before the sub-goal's is refused and names it", await morgan.waitFor(`The sub-goal “${SUB_GOAL}” is due`));
  await morgan.type("#goal-target", parent.target);
  await morgan.click("Save goal", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("putting the date back saves", await morgan.waitFor("Goal saved."));

  // --- 4. the task form offers the sub-goal under its parent's name --------------------------------------------------------
  await morgan.goto("/home?view=list", 4000);
  await morgan.press("n", 800);
  await morgan.click("More options", { exact: true, wait: 1500 });
  const options = await morgan.evaluate(`[...document.querySelectorAll("#task-goal option")].map((o) => o.textContent)`);
  step("the goal picker labels the sub-goal with its parent", Array.isArray(options) && options.includes(`${parent.title} › ${SUB_GOAL}`), JSON.stringify(options));
  await morgan.press("Escape", 500);
  step("no console errors for the leader", morgan.problems.length === 0, JSON.stringify(morgan.problems.slice(0, 2)));

  // --- 5. who may not -----------------------------------------------------------------------------------------------------
  const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 390, height: 844, dark: true }));
  await jordan.goto(parentPath, 4000);
  step("a member sees the sub-goals without New sub-goal or Edit", (await jordan.waitFor(SUB_GOAL)) && !(await hasButton(jordan, "/^(New sub-goal|Edit)$/")));
  await jordan.shot("08-member-phone-dark", { full: true });
  const riley = (browsers.riley = await openBrowser({ role: "other", width: 1280, height: 900 }));
  await riley.goto(subPath, 4000);
  step("another workspace gets Not found for the sub-goal", await riley.waitFor("Not found"));
} catch (error) {
  await stoppedOn(error, "08", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
