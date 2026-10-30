// Comments must be resolved before a task can be completed (docs/PLAN.md, 2026-10-30 log). On a seeded task with
// two open comments: the Resume card and the history heading count them; the Update progress form refuses to
// complete and says why; the status dialog does the same; a leader's Approve is held on an awaiting task with an
// open comment; resolving every comment (recorded in the audit trail) lets the task complete; a resolved comment
// can be reopened; a stakeholder never sees a Resolve button.
//
// Usage: node scripts/test-walkthrough/09-comments.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";

const buttonTexts = (browser) =>
  browser.evaluate(`[...document.querySelectorAll("main button")].filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim())`);
const openComments = async (taskId) => (await query("select count(*)::int as n from task_updates where task_id = $1 and kind = 'comment' and resolved_at is null", [taskId]))[0]?.n;

try {
  const [task] = await query(
    `select t.id, t.title, (select count(*)::int from task_updates u where u.task_id = t.id and u.kind = 'comment' and u.resolved_at is null) as open
       from tasks t where t.org_id = (${org}) and t.status = 'in_progress'
       and (select count(*) from task_updates u where u.task_id = t.id and u.kind = 'comment' and u.resolved_at is null) >= 2
       order by t.created_at limit 1`,
  );
  step("the seed has an in-progress task with two open comments", task?.open >= 2, task?.title);
  const taskPath = `/tasks/${task.id}`;

  // --- 1. the task says it is held ---------------------------------------------------------------------------------
  const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 1280, height: 900 }));
  await jordan.goto(taskPath, 4000);
  step("the Resume card counts the open comments", await jordan.waitFor(`${task.open} open comments to resolve before this task can be completed`));
  step("so does the history heading", await jordan.waitForNear("Comments and history", `${task.open} open comments`));
  await jordan.shot("09-task-with-open-comments", { full: true });

  // --- 2. the Update progress form refuses to complete ---------------------------------------------------------------
  await jordan.type(`#progress-${task.id}`, "Switched the policy on in production.");
  await jordan.select(`#mark-${task.id}`, "completed");
  await sleep(500);
  step("choosing Completed explains the hold", await jordan.waitFor(`Resolve the ${task.open} open comments before completing this task.`));
  step("and the Save button is held back", (await jordan.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save update")?.disabled`)) === true);
  await jordan.select(`#mark-${task.id}`, "");

  // --- 3. the status dialog refuses too ------------------------------------------------------------------------------------
  await jordan.click("Change status", { wait: 800 });
  await jordan.click("Completed", { exact: true, within: "[role=menu]", wait: 1200 });
  await jordan.waitFor("Mark as completed");
  step("the status dialog explains the hold", await jordan.waitFor(`Resolve the ${task.open} open comments before completing this task.`));
  step("with its button held back", (await jordan.evaluate(`[...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.trim() === "Mark as completed")?.disabled`)) === true);
  await jordan.press("Escape", 800);
  const [still] = await query("select status from tasks where id = $1", [task.id]);
  step("the task is still in progress", still?.status === "in_progress", JSON.stringify(still));

  // --- 4. resolving the comments frees it ------------------------------------------------------------------------------------
  for (let i = task.open; i > 0; i--) {
    await jordan.click("Resolve", { exact: true, wait: 2500 });
    step(`resolving a comment shows the toast (${task.open - i + 1} of ${task.open})`, await jordan.waitFor("Comment resolved."));
    await jordan.waitForGone("Comment resolved.", 8000);
  }
  step("no comment is open any more", (await openComments(task.id)) === 0);
  step("the history shows who resolved them", await jordan.waitFor("Resolved by Jordan Dev"));
  const resolvedRows = await query("select count(*)::int as n from task_activity where task_id = $1 and kind = 'comment_resolved'", [task.id]);
  step("the audit trail recorded each resolution", resolvedRows[0]?.n >= task.open, JSON.stringify(resolvedRows));
  await sleep(1000);
  step("the Resume card no longer mentions open comments", !(await jordan.has("to resolve before this task can be completed")));
  await jordan.shot("09-comments-resolved", { full: true });

  // --- 5. reopening puts the hold back; resolving again lets it complete ---------------------------------------------------------
  await jordan.click("Reopen", { exact: true, wait: 2500 });
  step("a resolved comment can be reopened", (await jordan.waitFor("Comment reopened.")) && (await openComments(task.id)) === 1);
  await jordan.waitForGone("Comment reopened.", 8000);
  await jordan.click("Resolve", { exact: true, wait: 2500 });
  await jordan.waitFor("Comment resolved.");
  await jordan.waitForGone("Comment resolved.", 8000);
  await jordan.type(`#progress-${task.id}`, "Policy enabled in production; test page delivered to the secondary.");
  await jordan.select(`#mark-${task.id}`, "completed");
  await sleep(500);
  step("with nothing open, Completed is offered without a warning", !(await jordan.has("before completing this task")));
  await jordan.click("Save update", { exact: true, wait: 3000 });
  step("saving completes the task", await jordan.waitFor("Update saved."));
  const [done] = await query("select status, completed_at from tasks where id = $1", [task.id]);
  step("the task is completed", done?.status === "completed" && done?.completed_at !== null, JSON.stringify(done));

  // --- 6. an approver is held by an open comment too -------------------------------------------------------------------------------
  const [awaiting] = await query(`select id, title from tasks where org_id = (${org}) and status = 'awaiting_approval' order by created_at limit 1`);
  step("the seed has a task awaiting approval", Boolean(awaiting?.id), awaiting?.title);
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await morgan.goto(`/tasks/${awaiting.id}`, 4000);
  await morgan.waitFor(awaiting.title);
  await morgan.type("Add a comment…", "Before I approve: did the rollback step get tested?");
  await morgan.evaluate(`document.querySelector('textarea[aria-label="Add a comment"]').closest("form").requestSubmit()`);
  step("the leader's question lands as an open comment", await morgan.waitFor("Open comment"));
  await sleep(1000);
  step("Approve is held while the comment is open", (await morgan.evaluate(`[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Approve")?.disabled`)) === true);
  await morgan.shot("09-approve-held");
  await morgan.click("Resolve", { exact: true, wait: 2500 });
  await morgan.waitFor("Comment resolved.");
  await sleep(1200);
  step("resolving it frees Approve", (await morgan.evaluate(`[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Approve")?.disabled`)) === false);
  step("no console errors", morgan.problems.length === 0 && jordan.problems.length === 0, JSON.stringify([...morgan.problems, ...jordan.problems].slice(0, 2)));

  // --- 7. who may not -------------------------------------------------------------------------------------------------------
  const [converted] = await query(
    `select t.id from tasks t join requests r on r.converted_task_id = t.id join users u on u.id = r.requester_id where t.org_id = (${org}) and u.email = 'taylor@trackwise.test' limit 1`,
  );
  const taylor = (browsers.taylor = await openBrowser({ role: "stakeholder", width: 1280, height: 900 }));
  await taylor.goto(`/tasks/${converted.id}`, 4000);
  step("a stakeholder reads the task without Resolve or Reopen", (await taylor.waitFor("Next action")) && !(await buttonTexts(taylor)).some((text) => /^(Resolve|Reopen)$/.test(text)));
} catch (error) {
  await stoppedOn(error, "09", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
