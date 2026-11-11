// Local tasks (docs/PLAN.md, 2026-11-06 log). Sam adds a task to Lumen Health, which asks for sign-off: it is saved
// local, off the project page (the main board) and in Sam's Local sections on the List and Board tabs, My Work and
// the Overview; its page says who would sign it; nobody else finds it by id, in a list or among the proposals. Sam
// ticks it in the Local section and sends it for sign-off: it becomes a pending proposal with Lumen's chain, leaves
// the Local section and shows as waiting; Morgan has it under Waiting for you. Then Morgan switches Lumen's sign-off
// off and Sam's remaining local tasks offer Publish instead: one is published and is on the project page for
// everyone. Last, Reports: a member's activity widget draws their local task; a leader's leaves it out.
//
// Usage: node scripts/test-walkthrough/15-local-tasks.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const stamp = Date.now().toString(36);
const TITLE = `Local draft ${stamp}`;
const TITLE2 = `Local publish ${stamp}`;
const TITLE3 = `Local due ${stamp}`;
const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";

/** Whether the page's Local section holds some text. */
const inLocalSection = (browser, text) => browser.evaluate(`(document.querySelector('[data-local-section]')?.innerText ?? '').includes(${JSON.stringify(text)})`);

/** The Local section's send button, as it reads. */
const sendButton = (browser) => browser.evaluate(`document.querySelector('[data-local-send]')?.textContent.trim() ?? null`);

/** Pins a day of the activity widget so its inspector lists that day's tasks (an SVG column: no click() of its own). */
async function pinDay(browser, day) {
  const ok = await browser.evaluate(`(() => {
    const el = document.querySelector('[data-day="${day}"] rect')
    if (!el) return false
    el.scrollIntoView({ block: "center" })
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    return true
  })()`);
  await sleep(800);
  return ok;
}

const inspector = (browser) => browser.evaluate(`document.querySelector('[data-testid="day-inspector"]')?.innerText ?? ''`);

try {
  // --- 1. a task added where sign-off applies is saved local, off the main board --------------------------------------
  const [lumen] = await query(`select id from projects where org_id = (${org}) and name = 'Lumen Health'`);
  const sam = (browsers.sam = await openBrowser({ role: "member2", width: 1280, height: 900 }));
  await sam.goto(`/projects/${lumen.id}`, 4000);
  await sam.waitFor("Lumen Health");
  step("the add bar says the task will stay local", await sam.waitForSelector("[data-local-hint]", 15_000));
  await sam.type("#quick-add-text", TITLE);
  await sam.click("Add local task", { exact: true, wait: 3000 });
  step("the toast says it was saved as a local task", await sam.waitFor("Saved as a local task", 10_000));
  const [created] = await query("select id, proposal_status from tasks where title = $1", [TITLE]);
  const [noChain] = await query("select count(*)::int as n from task_approvals where task_id = $1", [created?.id ?? ""]);
  step("it is local in the database, with no chain yet", created?.proposal_status === "local" && noChain.n === 0, JSON.stringify(created));
  await sleep(1500);
  step("the project page (the main board) doesn't list it", !(await sam.has(TITLE)));

  // --- 2. it is in Sam's Local sections: List, Board, My Work, Overview ------------------------------------------------------
  await sam.goto("/home?view=list", 4000);
  await sam.waitFor("Tasks");
  step("the List tab has a Local section with it", (await sam.waitForSelector("[data-local-section]", 15_000)) && (await inLocalSection(sam, TITLE)));
  step("the seeded local tasks are there too", await inLocalSection(sam, "Draft the clinic FAQ page"));
  step("with nothing ticked the button offers to send all of them", (await sendButton(sam))?.startsWith("Send all") === true, await sendButton(sam));
  await sam.shot("15-list-local-section");
  await sam.goto("/home?view=board", 4000);
  await sam.waitFor("Tasks");
  step("the Board tab shows it in the Local section, not as a card", (await sam.waitForSelector("[data-local-section]", 15_000)) && (await inLocalSection(sam, TITLE)) && (await sam.evaluate(`document.querySelectorAll('[data-task-row]').length`)) === (await sam.evaluate(`document.querySelectorAll('[data-local-section] [data-task-row]').length`)));
  await sam.goto("/my-work", 4000);
  await sam.waitFor("My Work");
  step("My Work opens with the Local section", (await sam.waitForSelector("[data-local-section]", 15_000)) && (await inLocalSection(sam, TITLE)));
  await sam.goto("/home?view=home", 4000);
  step("the Overview tab has it too", (await sam.waitForSelector("[data-local-section]", 15_000)) && (await inLocalSection(sam, TITLE)));

  // --- 3. the task page: the strip, who would sign, no update form ----------------------------------------------------------
  await sam.goto(`/tasks/${created.id}`, 4000);
  step("the task page says it is local and who would sign it", (await sam.waitFor("Local task", 15_000)) && (await sam.waitForSelector('[data-local-strip="sign-off"]', 5000)) && (await sam.has("Morgan Lead, then Avery Admin")));
  step("a local task has no update form", !(await sam.has("Save update")));
  await sam.shot("15-local-task-page", { full: true });

  // --- 4. nobody else sees it ----------------------------------------------------------------------------------------------------
  const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 1280, height: 900 }));
  await jordan.goto(`/tasks/${created.id}`, 4000);
  step("another member gets Not found by id", (await jordan.waitFor("Not found")) && !(await jordan.has(TITLE)));
  await jordan.goto("/home?view=list&closed=1", 4000);
  await jordan.waitFor("Tasks");
  step("and doesn't see it in the list", !(await jordan.has(TITLE)));
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await morgan.goto("/proposals", 4000);
  await morgan.waitFor("Proposals");
  step("a leader doesn't see it among the proposals", !(await morgan.has(TITLE)));

  // --- 5. sent for sign-off from the Local section's own bar --------------------------------------------------------------------
  await sam.goto("/home?view=list", 4000);
  await sam.waitFor("Tasks");
  await sam.waitForSelector("[data-local-section]", 15_000);
  await sam.clickSelector(`[data-select-task="${created.id}"]`);
  step("ticking a local row offers Deselect and a send button for one", (await sam.waitForSelector("[data-local-deselect]", 5000)) && (await sendButton(sam)) === "Send 1 for sign-off", await sendButton(sam));
  await sam.clickSelector("[data-local-select-all]");
  step("Select all ticks every local row", (await sam.evaluate(`document.querySelectorAll('[data-local-section] [data-selected]').length`)) === 3);
  await sam.clickSelector("[data-local-deselect]");
  step("Deselect clears them", (await sam.evaluate(`document.querySelectorAll('[data-local-section] [data-selected]').length`)) === 0);
  await sam.clickSelector(`[data-select-task="${created.id}"]`);
  await sam.clickSelector("[data-local-send]", { wait: 3000 });
  step("the bar sends it for sign-off", await sam.waitFor("1 task sent for sign-off", 10_000));
  const [sent] = await query("select proposal_status from tasks where id = $1", [created.id]);
  const chain = await query("select a.position, u.name from task_approvals a join users u on u.id = a.user_id where a.task_id = $1 order by a.position", [created.id]);
  step("it is a pending proposal with Lumen's chain", sent?.proposal_status === "pending" && chain.map((row) => row.name).join(",") === "Morgan Lead,Avery Admin", JSON.stringify({ sent, chain }));
  step("it has left the Local section and is on the main board as waiting", (await sam.waitForNear(TITLE, "Waiting for sign-off", { timeout: 15_000 })) && !(await inLocalSection(sam, TITLE)));
  await morgan.goto("/proposals", 4000);
  step("Morgan now sees it under Waiting for you", await morgan.waitForNear("Waiting for you", TITLE, { timeout: 15_000 }));
  const activity = await query("select kind from task_activity where task_id = $1 order by created_at", [created.id]);
  step("the history reads created, sent", activity.map((row) => row.kind).join(",") === "created,proposal_sent", activity.map((row) => row.kind).join(","));
  const notices = await query("select u.name from notifications n join users u on u.id = n.user_id where n.kind = 'proposal_waiting' and n.title like $1", [`%${TITLE}%`]);
  step("Morgan was told it waits for them", notices.some((row) => row.name === "Morgan Lead"), JSON.stringify(notices));

  // --- 6. sign-off switched off: the remaining local tasks publish instead ---------------------------------------------------------
  await sam.goto(`/projects/${lumen.id}`, 4000);
  await sam.waitFor("Lumen Health");
  await sam.type("#quick-add-text", TITLE2);
  await sam.click("Add local task", { exact: true, wait: 3000 });
  await sam.waitFor("Saved as a local task", 10_000);
  await sleep(1500);
  await sam.type("#quick-add-text", `${TITLE3} @tomorrow`);
  await sam.click("Add local task", { exact: true, wait: 3000 });
  step("two more local tasks, one due tomorrow", (await sam.waitFor("Saved as a local task", 10_000)) && (await query("select count(*)::int as n from tasks where title in ($1, $2) and proposal_status = 'local' and (title <> $2 or due_date = current_date + 1 or due_date = current_date + 2)", [TITLE2, TITLE3]))[0].n === 2);
  await morgan.goto(`/projects/${lumen.id}`, 4000);
  await morgan.waitFor("Lumen Health");
  await morgan.clickSelector("[data-approval-settings]");
  await morgan.waitFor("Sign-off for new tasks", 5000);
  await morgan.clickSelector("#approvals-on");
  await sleep(300);
  await morgan.click("Save sign-off settings", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("Morgan switches Lumen Health's sign-off off", await morgan.waitFor("Sign-off settings saved.", 10_000));
  const [flag] = await query("select requires_approval from projects where id = $1", [lumen.id]);
  step("the project no longer asks for sign-off", flag?.requires_approval === false, JSON.stringify(flag));
  await sam.goto("/my-work", 4000);
  await sam.waitFor("My Work");
  await sam.waitForSelector("[data-local-section]", 15_000);
  step("Sam's Local section now offers Publish instead", (await sam.evaluate(`document.querySelector('[data-local-send]')?.getAttribute('data-local-send')`)) === "publish", await sendButton(sam));
  await sam.shot("15-local-publish");
  const [second] = await query("select id from tasks where title = $1", [TITLE2]);
  await sam.clickSelector(`[data-select-task="${second.id}"]`);
  await sam.clickSelector("[data-local-send]", { wait: 3000 });
  step("publishing says so", await sam.waitFor("1 task published", 10_000));
  const [published] = await query("select proposal_status, status from tasks where id = $1", [second.id]);
  step("it is a live task now, never a proposal", published?.proposal_status === null && published?.status === "not_started", JSON.stringify(published));
  const kinds = await query("select kind from task_activity where task_id = $1 order by created_at", [second.id]);
  step("its history reads created, published", kinds.map((row) => row.kind).join(",") === "created,published", kinds.map((row) => row.kind).join(","));
  await jordan.goto(`/projects/${lumen.id}`, 4000);
  step("it is on the project page for everyone", await jordan.waitForNear("Not started", TITLE2, { timeout: 15_000 }));

  // --- 7. Reports: a member's activity widget draws their local task; a leader's leaves it out ---------------------------------------
  const [due] = await query("select due_date::text as day from tasks where title = $1", [TITLE3]);
  await sam.goto("/reports", 4000);
  step("a member's report names the activity widget and says local tasks are in it", (await sam.waitFor("Activity widget", 15_000)) && (await sam.has("your local tasks included")));
  step("the local task's day can be pinned", await pinDay(sam, due.day));
  step("the day inspector lists the local task as due", (await inspector(sam)).includes(TITLE3), (await inspector(sam)).slice(0, 160));
  await sam.shot("15-report-activity-widget", { full: true });
  await morgan.goto("/reports?cut=leader", 4000);
  await morgan.waitFor("Activity widget", 15_000);
  step("the leader's widget is the main board's and leaves the local task out", (await pinDay(morgan, due.day)) && (await inspector(morgan)).length > 0 && !(await inspector(morgan)).includes(TITLE3), (await inspector(morgan)).slice(0, 160));
  await morgan.goto("/reports?cut=exec", 4000);
  await morgan.waitFor("Activity widget", 15_000);
  step("the Executive widget leaves it out too", (await pinDay(morgan, due.day)) && !(await inspector(morgan)).includes(TITLE3));
  step("no console errors", sam.problems.length === 0 && jordan.problems.length === 0 && morgan.problems.length === 0, JSON.stringify([...sam.problems, ...jordan.problems, ...morgan.problems].slice(0, 2)));
} catch (error) {
  await stoppedOn(error, "15", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
