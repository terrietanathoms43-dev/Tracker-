// Sub-tasks (docs/PLAN.md, 2026-11-08 log). Morgan attaches one not-started task under another from the row menu's
// search dialog: the child moves into the parent's project and goal, the list draws it right under the parent with a
// corner mark and the parent carries a "1 sub-task" chip; the task page shows "Part of" on the child and the Sub-tasks
// section on the parent. Completing the parent is refused while the child is open; the child is marked Merged from
// its status menu (its row struck through, the history naming the parent); the parent can be completed now. Detach
// reopens the merged child. Then two ticked tasks are grouped under a third from the selection bar, and a sub-task is
// made from the parent page's own add bar.
//
// Usage: node scripts/test-walkthrough/17-sub-tasks.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";
const stamp = Date.now().toString(36);
const SUB = `Walkthrough sub-task ${stamp}`;

/** Two live, open, top-level tasks in different projects, so a move is visible. */
async function twoTasks() {
  return query(
    `select t.id, t.title, t.project_id, t.goal_id from tasks t
      where t.org_id = (${org}) and t.proposal_status is null and t.status = 'not_started' and t.parent_task_id is null and t.project_id is not null
        and not exists (select 1 from tasks c where c.parent_task_id = t.id)
      order by t.created_at limit 2`,
  );
}

try {
  const [parent, child] = await twoTasks();
  step("the seed has two open top-level tasks to work with", Boolean(parent?.id && child?.id), JSON.stringify([parent?.title, child?.title]));
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));

  // --- 1. attach from the row menu ------------------------------------------------------------------------------------
  await morgan.goto("/home?view=list", 4000);
  await morgan.waitFor("Tasks");
  await sleep(1500);
  await morgan.click(`Actions for ${child.title}`, { wait: 800 });
  await morgan.click("Attach to a task…", { within: "[role=menu]", wait: 1200 });
  step("the attach dialog opens with a search", await morgan.waitForSelector("[data-attach-task-dialog]", 6000));
  await morgan.type("Search tasks by title", parent.title.slice(0, 18));
  await sleep(900);
  await morgan.clickSelector(`[data-attach-choice="${parent.id}"]`, { wait: 3000 });
  step("attaching shows the toast naming the parent", await morgan.waitFor(`Attached under “${parent.title}”`, 10_000));
  const [attached] = await query("select parent_task_id, project_id, goal_id from tasks where id = $1", [child.id]);
  step("the child is attached and moved into the parent's project and goal", attached?.parent_task_id === parent.id && attached?.project_id === parent.project_id && (attached?.goal_id ?? null) === (parent.goal_id ?? null), JSON.stringify(attached));
  await sleep(2000);
  const nestedBelow = await morgan.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-task-row]')];
    const p = rows.findIndex((r) => r.dataset.taskRow === ${JSON.stringify(parent.id)});
    const c = rows[p + 1];
    return p >= 0 && c?.dataset.taskRow === ${JSON.stringify(child.id)} && c.dataset.nested === "true";
  })()`);
  step("the list draws the child right under its parent, nested", nestedBelow === true);
  step("the parent row carries the sub-task chip", (await morgan.evaluate(`document.querySelector('[data-task-row="${parent.id}"] [data-sub-tasks-chip]')?.textContent.trim() ?? null`)) === "1 sub-task");
  await morgan.shot("17-nested-rows");

  // --- 2. the task pages --------------------------------------------------------------------------------------------------
  await morgan.goto(`/tasks/${child.id}`, 4000);
  step("the child's page says what it is part of", (await morgan.waitFor("Next action")) && (await morgan.evaluate(`document.querySelector('[data-part-of]')?.textContent.includes(${JSON.stringify(parent.title)})`)) === true);
  await morgan.goto(`/tasks/${parent.id}`, 4000);
  step("the parent's page lists it under Sub-tasks", (await morgan.waitFor("Sub-tasks")) && (await morgan.evaluate(`document.querySelector('[data-sub-tasks] [data-task-row="${child.id}"]') !== null`)) === true);
  await morgan.shot("17-parent-page", { full: true });

  // --- 3. the parent waits; the child is merged; then the parent completes ----------------------------------------------
  await morgan.click("Change status", { wait: 800 });
  await morgan.click("Completed", { exact: true, within: "[role=menu]", wait: 1500 });
  await morgan.waitFor("Mark as completed", 5000);
  step("completing the parent is held while its sub-task is open", (await morgan.waitFor("open sub-task", 5000)) && (await morgan.evaluate(`[...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.trim() === "Mark as completed")?.disabled`)) === true);
  await morgan.press("Escape", 800);
  await morgan.goto(`/tasks/${child.id}`, 4000);
  await morgan.waitFor("Next action");
  await morgan.click("Change status", { wait: 800 });
  step("the child offers Merged", await morgan.evaluate(`[...document.querySelectorAll('[role=menu] [role=menuitem]')].some((e) => e.textContent.trim() === "Merged")`));
  await morgan.click("Merged", { exact: true, within: "[role=menu]", wait: 1500 });
  step("merging explains itself and needs no words", (await morgan.waitFor("Merge into its parent", 5000)) && (await morgan.has("folded into")));
  await morgan.click("Merge into its parent", { exact: true, within: "[role=dialog]", wait: 3000 });
  const [merged] = await query("select status, rejection_reason from tasks where id = $1", [child.id]);
  step("the child is merged with the parent as its reason", merged?.status === "merged" && merged?.rejection_reason?.includes(parent.title), JSON.stringify(merged));
  const [mergedLine] = await query("select kind, after from task_activity where task_id = $1 and kind = 'merged'", [child.id]);
  step("the history line names the parent", mergedLine?.after?.parentTitle === parent.title, JSON.stringify(mergedLine));
  await sleep(1500);
  step("the Resume card says it was merged", await morgan.waitFor("Merged into", 10_000));
  await morgan.goto(`/tasks/${parent.id}`, 4000);
  await morgan.waitFor("Next action");
  await morgan.click("Change status", { wait: 800 });
  await morgan.click("Completed", { exact: true, within: "[role=menu]", wait: 1500 });
  await morgan.waitFor("Mark as completed", 5000);
  await morgan.type("#transition-summary", "Done, with the duplicate folded in.");
  await morgan.click("Mark as completed", { exact: true, within: "[role=dialog]", wait: 3000 });
  step("with the sub-task merged the parent completes", await morgan.waitFor("Marked completed", 10_000));

  // --- 4. detach reopens the merged child ---------------------------------------------------------------------------------
  await morgan.goto(`/tasks/${child.id}`, 4000);
  await morgan.waitFor("Next action");
  await morgan.goto("/home?view=list&closed=1", 4000);
  await morgan.waitFor("Tasks");
  await sleep(1500);
  await morgan.click(`Actions for ${child.title}`, { wait: 800 });
  await morgan.click("Detach from its task", { within: "[role=menu]", wait: 3000 });
  step("detaching a merged task reopens it", await morgan.waitFor("Detached and open again", 10_000));
  const [detached] = await query("select parent_task_id, status from tasks where id = $1", [child.id]);
  step("it is a task of its own again, not started", detached?.parent_task_id === null && detached?.status === "not_started", JSON.stringify(detached));

  // --- 5. group two ticked tasks under a third from the selection bar ----------------------------------------------------------
  const rows = await query(
    `select t.id, t.title from tasks t where t.org_id = (${org}) and t.proposal_status is null and t.status = 'not_started' and t.parent_task_id is null
        and not exists (select 1 from tasks c where c.parent_task_id = t.id) and t.id <> $1 order by t.created_at limit 3`,
    [parent.id],
  );
  step("three more open tasks to group", rows.length === 3, JSON.stringify(rows.map((row) => row.title)));
  const [target, ...members] = rows;
  await morgan.goto("/home?view=list", 4000);
  await morgan.waitFor("Tasks");
  await sleep(1500);
  for (const row of members) await morgan.clickSelector(`[data-select-task="${row.id}"]`);
  await morgan.waitFor("2 selected", 5000);
  await morgan.clickSelector("[data-bulk-group]", { wait: 1200 });
  step("Group under… opens the attach dialog for the ticked tasks", (await morgan.waitForSelector("[data-attach-task-dialog]", 6000)) && (await morgan.has("Group 2 tasks under a task")));
  await morgan.type("Search tasks by title", target.title.slice(0, 18));
  await sleep(900);
  await morgan.clickSelector(`[data-attach-choice="${target.id}"]`, { wait: 3000 });
  step("both are attached", await morgan.waitFor("2 tasks attached", 10_000));
  const [grouped] = await query("select count(*)::int as n from tasks where parent_task_id = $1", [target.id]);
  step("the target has two sub-tasks in the database", grouped?.n === 2, JSON.stringify(grouped));

  // --- 6. a sub-task from the parent page's add bar -----------------------------------------------------------------------------
  await morgan.goto(`/tasks/${target.id}`, 4000);
  await morgan.waitFor("Sub-tasks");
  await sleep(1000);
  await morgan.type('[data-sub-tasks] input[id="quick-add-title"]', SUB);
  await morgan.click("Add task", { exact: true, within: "[data-sub-tasks]", wait: 3000 });
  step("the add bar in the section makes a sub-task", await morgan.waitFor("Task created.", 10_000));
  const [made] = await query("select parent_task_id, project_id, proposal_status from tasks where title = $1", [SUB]);
  step("it is attached to the parent, in its project, live", made?.parent_task_id === target.id && made?.project_id !== undefined && made?.proposal_status === null, JSON.stringify(made));
  step("no console errors", morgan.problems.length === 0, JSON.stringify(morgan.problems.slice(0, 3)));
} catch (error) {
  await stoppedOn(error, "17", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
