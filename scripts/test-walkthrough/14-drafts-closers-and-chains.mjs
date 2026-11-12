// The Draft tab, visible proposals, the closer task, missed repeats and sign-off groups (docs/PLAN.md, 2026-11-04
// log). Morgan jots notes that save themselves, keeps the notepad floating over another page, folds and reopens it,
// and turns the notes into a draft; Sam's task under Lumen Health starts local (2026-11-06 log) and, once sent for
// sign-off from the list's Local section, shows at once in the project, the list and My Work as waiting for
// sign-off; Morgan's decision on a task Sam changed meanwhile is refused, then goes through; a goal's "Everything
// completed" task (2026-11-09 log) can't be completed while another task under the goal is open (the server refuses
// a dialog that went stale), completing it last achieves the goal and tells its owner, and reopening a task under
// the achieved goal opens the goal and its closer again; a daily task three days behind gets its missed days,
// stopping at its end date, and loading again doubles nothing; a sign-off step names two people; a goal is deleted
// together with its sub-goal: the tasks stay, the two closers go.
//
// Usage: node scripts/test-walkthrough/14-drafts-closers-and-chains.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";
const stamp = Date.now().toString(36);
const NOTES = `Meeting: Draft check ${stamp}\nProject: Incident tooling\nGoal: Nobody is paged twice ${stamp}\nAction item: Jordan will publish the on-call handbook by Friday\nAction item: Sam to rotate the paging webhook secret by 2026-11-14 (urgent)`;

/** Completes a task from the status menu on its page, with the summary every completion needs (2026-11-07 log). */
async function complete(browser, id, summary = "Done.") {
  await browser.goto(`/tasks/${id}`, 4000);
  await browser.waitFor("Next action");
  await browser.click("Change status", { wait: 800 });
  await browser.click("Completed", { exact: true, within: "[role=menu]", wait: 1500 });
  await browser.waitFor("Mark as completed", 5000);
  await browser.type("#transition-summary", summary);
  await browser.click("Mark as completed", { exact: true, within: "[role=dialog]", wait: 2500 });
}

/** Reopens a completed task from the status menu on its page (In progress needs no dialog). */
async function reopen(browser, id) {
  await browser.goto(`/tasks/${id}`, 4000);
  await browser.waitFor("Next action");
  await browser.click("Change status", { wait: 800 });
  await browser.click("In progress", { exact: true, within: "[role=menu]", wait: 2500 });
}

try {
  // --- 1. the Draft tab and the floating notepad --------------------------------------------------------------------
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await morgan.goto("/home?view=draft", 4000);
  step("the Draft tab opens with the notepad", (await morgan.waitFor("Jot anything", 15_000)) && (await morgan.evaluate(`document.querySelector('#draft-body') !== null`)));
  await morgan.type("#draft-body", NOTES);
  step("typing saves itself", await morgan.waitForSelector('[data-draft-save][data-save-state="saved"]', 10_000));
  const [draft] = await query(`select body from draft_notes d join users u on u.id = d.user_id where u.email = 'morgan@trackwise.test' and d.org_id = (${org}) order by d.updated_at desc limit 1`);
  step("the note is in the database, as Morgan's first draft", (draft?.body ?? "").includes(`Draft check ${stamp}`));
  await morgan.click("Keep the notepad open while you browse", { wait: 800 });
  await morgan.goto("/goals", 4000);
  await morgan.waitFor("Goals");
  step("the floating notepad follows to another page with the same text", (await morgan.evaluate(`document.querySelector('[data-notepad="open"]') !== null && document.querySelector('[data-notepad-body]')?.value.includes("Draft check ${stamp}")`)) === true);
  await morgan.shot("14-notepad-floating");
  await morgan.click("Fold the notepad to the edge", { wait: 600 });
  step("it folds to a tab on the edge", (await morgan.evaluate(`document.querySelector('[data-notepad="collapsed"]') !== null`)) === true);
  await morgan.clickSelector('[data-notepad="collapsed"]');
  step("the tab opens it again", await morgan.waitForSelector('[data-notepad="open"]', 4000));
  await morgan.click("Put the notepad away", { wait: 600 });
  step("the × puts it away", (await morgan.evaluate(`document.querySelector('[data-notepad]') === null`)) === true);
  await morgan.goto("/home?view=draft", 4000);
  await morgan.waitFor("Turn it into work", 15_000);
  await morgan.click("Turn into work", { exact: true, wait: 1000 });
  await morgan.click("Draft the plan from these notes", { exact: true, wait: 1500 });
  step("the notes become a draft to review", await morgan.waitFor("Will create 1 goal and 2 tasks", 30_000));
  await morgan.shot("14-draft-review", { full: true });

  // --- 2. a task under a sign-off project starts local; sent for sign-off, it shows at once, highlighted ------------------
  const [lumen] = await query(`select id from projects where org_id = (${org}) and name = 'Lumen Health'`);
  const sam = (browsers.sam = await openBrowser({ role: "member2", width: 1280, height: 900 }));
  await sam.goto(`/projects/${lumen.id}`, 4000);
  await sam.waitFor("Lumen Health");
  const TITLE = `Visible proposal ${stamp}`;
  await sam.type("#quick-add-text", TITLE);
  await sam.click("Add local task", { exact: true, wait: 3000 });
  step("the add bar saves it as a local task", await sam.waitFor("Saved as a local task", 10_000));
  const [row] = await query("select id from tasks where title = $1", [TITLE]);
  await sam.goto("/home?view=list", 4000);
  await sam.waitFor("Tasks");
  step("it is in the list's Local section", (await sam.waitForSelector("[data-local-section]", 15_000)) && (await sam.evaluate(`(document.querySelector('[data-local-section]')?.innerText ?? '').includes(${JSON.stringify(TITLE)})`)) === true);
  await sam.clickSelector(`[data-select-task="${row.id}"]`);
  await sam.clickSelector("[data-local-send]", { wait: 3000 });
  step("sent for sign-off from the Local section", await sam.waitFor("1 task sent for sign-off", 10_000));
  step("it is in the task list now, highlighted as waiting", await sam.waitForNear(TITLE, "Waiting for sign-off", { timeout: 15_000 }));
  await sam.goto(`/projects/${lumen.id}`, 4000);
  await sam.waitFor("Lumen Health");
  step("and on the project page, highlighted", await sam.waitForNear(TITLE, "Waiting for sign-off", { timeout: 15_000 }));
  await sam.goto("/my-work", 4000);
  step("and in My Work under Waiting on others", await sam.waitForNear("Waiting on others", TITLE, { timeout: 15_000 }));
  await sam.shot("14-proposal-in-my-work");

  // --- 3. a decision on a changed proposal is refused --------------------------------------------------------------------
  await morgan.goto("/proposals", 4000);
  await morgan.waitForNear("Waiting for you", TITLE, { timeout: 15_000 });
  await sam.goto(`/tasks/${row.id}`, 4000);
  await sam.waitFor("Next action");
  await sam.click("Click to edit the title", { wait: 600 });
  await sam.type('input[aria-label="Title"]', `${TITLE} edited`);
  await sam.press("Enter", 2500);
  step("the proposer edits the title while Morgan has the page open", await sam.waitFor("Title saved.", 10_000));
  await morgan.click("Approve", { near: TITLE, exact: true, wait: 2500 });
  step("Morgan's stale Approve is refused because the task changed", await morgan.waitFor("changed since you opened it", 10_000));
  await sleep(2500);
  await morgan.click("Approve", { near: `${TITLE} edited`, exact: true, wait: 2500 });
  step("after the refresh the decision goes through", await morgan.waitFor("Signed off. It waits for the next person.", 10_000));

  // --- 4. the goal's closer: it waits for the other tasks, achieves the goal, and opens again with it ------------------------
  const [review] = await query(`select id, owner_id from goals where org_id = (${org}) and title = 'Every incident gets a review'`);
  const under = await query("select id, title, goal_closer from tasks where goal_id = $1 and status not in ('completed', 'rejected', 'deferred', 'cancelled') and (proposal_status is null or proposal_status = 'approved') order by goal_closer, created_at", [review.id]);
  step("the goal has one open task and its closer", under.length === 2 && !under[0].goal_closer && under[1].goal_closer, JSON.stringify(under.map((task) => task.title)));
  const [last, closer] = under;
  const goalStatus = async () => (await query("select status, completed_at from goals where id = $1", [review.id]))[0];
  const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 1280, height: 900 }));
  await morgan.goto(`/goals/${review.id}`, 4000);
  await morgan.waitFor("Every incident gets a review");
  await morgan.click("Mark completed", { exact: true, wait: 2500 });
  step("marking the goal completed with a task still open is refused with the count", await morgan.waitFor("Finish the 1 open task", 10_000));
  await complete(jordan, last.id, "Review template agreed and published.");
  step("completing the other task leaves the goal active: the closer is still open", (await jordan.waitFor("Marked completed.", 10_000)) && !(await jordan.has("is achieved")) && (await goalStatus())?.status === "active");
  // Morgan opens the closer's dialog while nothing else is open; Jordan reopens the task; Morgan's save is refused.
  await morgan.goto(`/tasks/${closer.id}`, 4000);
  await morgan.waitFor("Completing this marks", 10_000);
  await morgan.click("Change status", { wait: 800 });
  await morgan.click("Completed", { exact: true, within: "[role=menu]", wait: 1500 });
  await morgan.waitFor("Mark as completed", 5000);
  await morgan.type("#transition-summary", "Every review this quarter is written up.");
  await reopen(jordan, last.id);
  await sleep(1500);
  await morgan.click("Mark as completed", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("the server refuses a closer whose dialog went stale: another task is open again", (await morgan.waitFor("Finish the other 1 task under", 10_000)) && (await goalStatus())?.status === "active");
  await morgan.press("Escape", 600);
  await complete(jordan, last.id, "Review template agreed and published.");
  await jordan.waitFor("Marked completed.", 10_000);
  // Jordan, a member, completes the closer: the goal is achieved and Morgan, its owner, hears.
  await complete(jordan, closer.id, "Every review this quarter is written up.");
  step("completing the closer says the goal is achieved", await jordan.waitFor("is achieved", 10_000));
  const achieved = await goalStatus();
  step("the goal is completed in the database", achieved?.status === "completed" && achieved?.completed_at !== null, JSON.stringify(achieved));
  const heard = await query("select title from notifications where user_id = $1 and kind = 'goal_achieved' and href = $2", [review.owner_id, `/goals/${review.id}`]);
  step("the goal's owner is told it was achieved", heard.length === 1 && heard[0].title === "Goal achieved: Every incident gets a review", JSON.stringify(heard));
  await reopen(jordan, last.id);
  step("reopening a task under an achieved goal makes the goal active again", await jordan.waitFor("is active again", 10_000));
  const reactivated = await goalStatus();
  step("the goal is active again in the database", reactivated?.status === "active" && reactivated?.completed_at === null, JSON.stringify(reactivated));
  const [reopenedCloser] = await query("select status, (select count(*)::int from task_activity a where a.task_id = t.id and a.kind = 'reopened') as reopened from tasks t where t.id = $1", [closer.id]);
  step("and its closer is open again, with the reason in its history", reopenedCloser?.status === "not_started" && reopenedCloser?.reopened === 1, JSON.stringify(reopenedCloser));
  await complete(jordan, last.id, "Review template agreed and published.");
  await jordan.waitFor("Marked completed.", 10_000);
  await complete(jordan, closer.id, "Every review this quarter is written up.");
  await jordan.waitFor("is achieved", 10_000);

  // --- 5. missed repeats are caught up, within the rule's end -----------------------------------------------------------------
  const [tapes] = await query(`select id, series_id from tasks where org_id = (${org}) and title = 'Change the backup tapes' order by due_date desc limit 1`);
  await query("update tasks set due_date = current_date - 3, recurrence = recurrence || jsonb_build_object('until', to_char(current_date - 1, 'YYYY-MM-DD')) where id = $1", [tapes.id]);
  await jordan.goto("/home?view=list", 4000);
  await jordan.waitFor("Tasks");
  const series = await query("select due_date::text as due, status from tasks where series_id = $1 order by due_date", [tapes.series_id]);
  step("the two missed days were made, stopping at the end date", series.length === 3 && series.every((task) => task.status === "not_started"), JSON.stringify(series));
  step("the overdue copies are in the list", await jordan.waitForNear("Change the backup tapes", "overdue", { timeout: 15_000 }));
  await jordan.goto(`/tasks/${tapes.id}`, 4000);
  step("the rule reads with its end date", await jordan.waitFor("until", 15_000));
  await jordan.goto("/home?view=list", 4000);
  await jordan.waitFor("Tasks");
  const [again] = await query("select count(*)::int as n from tasks where series_id = $1", [tapes.series_id]);
  step("loading again doubles nothing", again.n === 3, JSON.stringify(again));

  // --- 6. a sign-off step naming two people; the repeat picker's Until ----------------------------------------------------------
  await morgan.goto(`/projects/${lumen.id}`, 4000);
  await morgan.waitFor("Lumen Health");
  await morgan.clickSelector("[data-approval-settings]");
  await morgan.waitFor("Sign-off for new tasks", 5000);
  await morgan.clickSelector("[data-add-step]");
  await sleep(500);
  await morgan.click("Pick who may sign this step", { within: "[role=dialog]", wait: 800 });
  await morgan.click("Jordan Dev", { within: "[cmdk-list]", wait: 400 });
  await morgan.click("Sam Dev", { within: "[cmdk-list]", wait: 400 });
  await morgan.press("Escape", 500);
  step("a step can name two people, either of whom signs", (await morgan.evaluate(`/\\bor\\b/.test(document.querySelector('[data-approval-step="3"]')?.innerText ?? "")`)) === true);
  await morgan.click("Save sign-off settings", { exact: true, within: "[role=dialog]", wait: 2500 });
  const steps = await query("select position, count(*)::int as n from approval_steps where project_id = $1 group by position order by position", [lumen.id]);
  step("the third step has two signers in the database", JSON.stringify(steps) === JSON.stringify([{ position: 1, n: 1 }, { position: 2, n: 1 }, { position: 3, n: 2 }]), JSON.stringify(steps));
  await morgan.goto("/home?view=list", 4000);
  await morgan.press("n", 800);
  await morgan.click("More options", { exact: true, wait: 1500 });
  await morgan.select("#repeat-unit", "day");
  step("the repeat picker offers an Until date", await morgan.waitForSelector("#repeat-until", 4000));
  await morgan.press("Escape", 500);

  // --- 7. delete a goal together with its sub-goal -----------------------------------------------------------------------------
  const [ship] = await query(`select id, project_id from goals where org_id = (${org}) and title = 'Ship the self-serve onboarding'`);
  const [sub] = await query("select id from goals where parent_goal_id = $1", [ship.id]);
  const closers = await query("select id from tasks where goal_closer and goal_id = any($1::text[])", [[ship.id, sub.id]]);
  await morgan.goto(`/goals/${ship.id}`, 4000);
  await morgan.clickSelector("[data-delete-goal]");
  await morgan.waitFor("Delete this goal?", 5000);
  await morgan.clickSelector("[data-delete-sub-goals]");
  step("the dialog offers to delete the sub-goal too", await morgan.waitFor("deleted too", 3000));
  await morgan.click("Delete goal", { exact: true, within: "[role=dialog]", wait: 3000 });
  step("deleting says what happened", await morgan.waitFor("sub-goal deleted too", 10_000));
  const [gone] = await query("select count(*)::int as n from goals where id = any($1::text[])", [[ship.id, sub.id]]);
  const [detached] = await query("select count(*)::int as n from tasks where project_id = $1 and goal_id is null", [ship.project_id]);
  step("both goals are gone and their tasks stay in the project", gone.n === 0 && detached.n > 0, JSON.stringify({ gone, detached }));
  const [left] = await query("select count(*)::int as n from tasks where id = any($1::text[]) or (project_id = $2 and goal_closer and goal_id is null)", [closers.map((row) => row.id), ship.project_id]);
  step("their two closers went with them: no “Everything completed” is left without a goal", closers.length === 2 && left.n === 0, JSON.stringify({ closers: closers.length, left }));
  step("no console errors", morgan.problems.length === 0 && sam.problems.length === 0 && jordan.problems.length === 0, JSON.stringify([...morgan.problems, ...sam.problems, ...jordan.problems].slice(0, 2)));
} catch (error) {
  await stoppedOn(error, "14", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
