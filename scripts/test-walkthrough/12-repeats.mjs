// Repeating work (docs/PLAN.md, 2026-11-03 log): completing the daily "Change the backup tapes" task makes the
// next occurrence, due tomorrow at 8:00, in the same series, and completing it again doesn't double it; the
// Update progress form has one Status control with the same statuses as the lists; finishing the weekly
// "Weekly ops duties" goal (its tasks, then its "Everything completed" task) makes next week's goal with fresh copies
// of its tasks, closer included; a member can't mark a goal completed from its page.
//
// Usage: node scripts/test-walkthrough/12-repeats.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";

try {
  const [tapes] = await query(`select id, due_date::text as due, series_id, recurrence from tasks where org_id = (${org}) and title = 'Change the backup tapes'`);
  step("the seed has the daily tapes task", Boolean(tapes?.id) && tapes.recurrence?.unit === "day", JSON.stringify(tapes));

  // --- 1. the task page shows the repeat, the Update progress form has one Status control ------------------------
  const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 1280, height: 900 }));
  await jordan.goto(`/tasks/${tapes.id}`, 4000);
  step("the task page says how it repeats", (await jordan.waitFor("Change the backup tapes")) && (await jordan.has("Every day at 8:00 AM")));
  const statusOptions = await jordan.evaluate(`[...document.querySelectorAll('select[id^="status-"] option')].map((o) => o.textContent.trim())`);
  step(
    "the Update progress form offers the one set of statuses, no separate Mark as",
    Array.isArray(statusOptions) && statusOptions.includes("Completed") && statusOptions.includes("Blocked") && statusOptions.includes("Awaiting approval") && !(await jordan.has("Mark as")) && !(await jordan.has("I'm blocked")),
    JSON.stringify(statusOptions),
  );
  await jordan.shot("12-task-repeats", { full: true });

  // --- 2. completing it makes the next occurrence ------------------------------------------------------------
  await jordan.type('textarea[id^="progress-"]', "Swapped the set, serials logged.");
  await jordan.select('select[id^="status-"]', "completed");
  await sleep(400);
  step("picking Completed says the next one will be made", await jordan.waitFor("completing makes the next one"));
  await jordan.type('textarea[aria-label="Completion summary"]', "Tapes swapped and logged.");
  await jordan.click("Save update", { exact: true, wait: 3000 });
  step("the toast names the next due day", await jordan.waitFor("The next one is due"));
  const series = await query("select id, status, due_date::text as due, due_time, recurrence from tasks where series_id = $1 order by created_at", [tapes.series_id]);
  step("the series now has two tasks: the done one and the next", series.length === 2 && series[0].status === "completed" && series[1].status === "not_started", JSON.stringify(series));
  const next = series[1];
  step("the next one is due the day after, at the same time, with the same rule", next?.due > tapes.due && next?.due_time === "08:00" && next?.recurrence?.unit === "day", JSON.stringify(next));
  const [nextHistory] = await query("select note from task_activity where task_id = $1 and kind = 'created'", [next.id]);
  step("its history says where it came from", typeof nextHistory?.note === "string" && nextHistory.note.includes("Next occurrence"));

  // --- 3. completing it twice never doubles it -------------------------------------------------------------------
  await jordan.goto(`/tasks/${tapes.id}`, 4000);
  await jordan.click("Change status", { wait: 800 });
  await jordan.click("In progress", { exact: true, wait: 2500 });
  step("the finished one can be reopened", await jordan.waitFor("Status changed."));
  await jordan.click("Change status", { wait: 800 });
  await jordan.click("Completed", { exact: true, wait: 1500 });
  await jordan.type("#transition-summary", "Done again.");
  await jordan.click("Mark as completed", { within: "[role=dialog]", exact: true, wait: 3000 });
  const again = await query("select count(*)::int as n from tasks where series_id = $1", [tapes.series_id]);
  step("completing it again adds no third occurrence while the next is open", again[0]?.n === 2, JSON.stringify(again));

  // --- 4. a repeating goal: a member cannot mark it completed, finishing its tasks and then its closer achieves it, and the next week appears
  const [ops] = await query(`select id, target_date::text as target, series_id from goals where org_id = (${org}) and title = 'Weekly ops duties'`);
  step("the seed has the weekly ops goal", Boolean(ops?.id));
  const [before] = await query("select count(*)::int as n from tasks where goal_id = $1 and (proposal_status is null or proposal_status = 'approved') and status not in ('rejected', 'cancelled')", [ops.id]);
  await jordan.goto(`/goals/${ops.id}`, 4000);
  step("the goal page says it repeats", (await jordan.waitFor("Weekly ops duties")) && (await jordan.has("Every week")));
  step("a member has no Mark completed button", !(await jordan.evaluate(`[...document.querySelectorAll("main button")].some((b) => b.offsetParent !== null && b.textContent.trim() === "Mark completed")`)));

  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await morgan.goto(`/goals/${ops.id}`, 4000);
  await morgan.click("Mark completed", { exact: true, wait: 2500 });
  step("a leader marking it completed with tasks open is refused with the count", await morgan.waitFor("open tasks under", 10_000));
  // The goal's "Everything completed" task comes last: it waits for the others (2026-11-09 log).
  const open = await query("select id, title, goal_closer from tasks where goal_id = $1 and (proposal_status is null or proposal_status = 'approved') and status not in ('completed', 'rejected', 'deferred', 'cancelled') order by goal_closer, created_at", [ops.id]);
  step("the goal has open tasks to finish, its closer last", open.length >= 2 && open.at(-1)?.goal_closer === true && open.filter((task) => task.goal_closer).length === 1, JSON.stringify(open.map((task) => task.title)));
  for (const task of open) {
    await jordan.goto(`/tasks/${task.id}`, 4000);
    await jordan.waitFor("Next action");
    await jordan.click("Change status", { wait: 800 });
    await jordan.click("Completed", { exact: true, within: "[role=menu]", wait: 1500 });
    await jordan.waitFor("Mark as completed", 5000);
    await jordan.type("#transition-summary", `${task.title}: done for the week.`);
    await jordan.click("Mark as completed", { exact: true, within: "[role=dialog]", wait: 3000 });
  }
  step("completing its closer says the goal is achieved and the next one is due, with its tasks copied", (await jordan.waitFor("is achieved", 10_000)) && (await jordan.has("The next one is due")));
  const goals = await query("select id, status, target_date::text as target from goals where series_id = $1 order by created_at", [ops.series_id]);
  step("the series has the completed goal and a new active one a week on", goals.length === 2 && goals[0].status === "completed" && goals[1].status === "active" && goals[1].target > ops.target, JSON.stringify(goals));
  const [copied] = await query("select count(*)::int as n from tasks where goal_id = $1", [goals[1].id]);
  step("the next goal got fresh copies of the tasks", copied?.n === before.n, `${copied?.n} copies for ${before.n} tasks`);
  const nextClosers = await query("select status, due_date::text as due from tasks where goal_id = $1 and goal_closer", [goals[1].id]);
  step("one of them is its own closer, open and due on the new target", nextClosers.length === 1 && nextClosers[0].status === "not_started" && nextClosers[0].due === goals[1].target, JSON.stringify(nextClosers));
  await morgan.goto(`/goals/${goals[1].id}`, 4000);
  step("the next goal's page shows the copied tasks as not started, ending with its closer", (await morgan.waitFor("Weekly ops duties")) && (await morgan.has("Send Lumen the weekly summary")) && (await morgan.has("Marks this goal achieved")));
  await morgan.shot("12-next-week-goal", { full: true });
  step("no console errors", morgan.problems.length === 0 && jordan.problems.length === 0, JSON.stringify([...morgan.problems, ...jordan.problems].slice(0, 2)));
} catch (error) {
  await stoppedOn(error, "12", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
