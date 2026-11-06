// A proposal's whole life (docs/PLAN.md, 2026-11-03 log): Taylor (a stakeholder) proposes a task → it is not in
// the task list → Morgan declines it with a note → Taylor sees the note and sends it again → Morgan approves → it
// is a live task in the list, with the history and the notifications in the database. Then the sign-off chain of
// Lumen Health: Sam adds a task there (it starts local: 2026-11-06 log) and sends it for sign-off → Morgan signs
// step 1 → Avery signs step 2 → live; Jordan adds one and skips the queue. Riley (Other Co) sees none of it.
//
// Usage: node scripts/test-walkthrough/04-proposals.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, step, stoppedOn, tidy } from "./lib.mjs";

const stamp = Date.now().toString(36);
const TITLE = `Walkthrough proposal ${stamp}`;
const LUMEN_TITLE = `Walkthrough Lumen proposal ${stamp}`;
const BYPASS_TITLE = `Walkthrough Lumen bypass ${stamp}`;
const started = new Date();
const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";

/** The visible buttons on the page: proves "no decision controls" without matching words in prose. */
const buttonTexts = (browser) =>
  browser.evaluate(`[...document.querySelectorAll("main button")].filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim())`);

try {
  // --- 1. Taylor (stakeholder) proposes from the add bar on the Proposals page ----------------------------------
  const taylor = (browsers.taylor = await openBrowser({ role: "stakeholder", width: 390, height: 844 }));
  await taylor.goto("/proposals", 4000);
  step("a stakeholder lands on Proposals with an add bar that says Propose", (await taylor.waitFor("What you've proposed")) && (await taylor.evaluate(`document.querySelector("#quick-add-title")?.placeholder`)) === "Propose a task and press Enter");
  await taylor.type("#quick-add-title", TITLE);
  await taylor.click("Propose task", { exact: true, wait: 2500 });
  step("proposing shows the toast", await taylor.waitFor("Proposed. It goes live once it is signed off."));
  step("the proposal shows as waiting for sign-off", await taylor.waitForNear(TITLE, "Waiting for sign-off"));
  const [created] = await query("select id, proposal_status, created_by from tasks where title = $1", [TITLE]);
  step("the row is a pending proposal", created?.proposal_status === "pending", JSON.stringify(created));
  const chain = await query("select position, user_id, decision from task_approvals where task_id = $1 order by position", [created.id]);
  step("its chain is one step for any leader", chain.length === 1 && chain[0].user_id === null && chain[0].decision === null, JSON.stringify(chain));
  await taylor.shot("04-stakeholder-proposed");

  // --- 2. It shows in the lists at once, highlighted as waiting for sign-off (2026-11-04 log) ----------------------
  const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 1280, height: 900 }));
  await jordan.goto("/home?view=list&closed=1", 4000);
  step("a pending proposal is in the task list, highlighted as waiting for sign-off", (await jordan.waitFor("Tasks")) && (await jordan.waitForNear(TITLE, "Waiting for sign-off")));
  await jordan.goto("/proposals", 4000);
  step("a member sees it under Waiting on others, without Approve", (await jordan.waitForNear(TITLE, "Waiting for sign-off")) && !(await buttonTexts(jordan)).some((text) => text === "Approve"));

  // --- 3. Morgan declines with a note --------------------------------------------------------------------------
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await morgan.goto("/home?view=home", 4000);
  step("the leader's Home tab says proposals wait for their sign-off", await morgan.waitFor("waiting for your sign-off"));
  await morgan.goto("/proposals", 4000);
  step("the leader sees it under Waiting for you", await morgan.waitForNear("Waiting for you", TITLE));
  await morgan.click("Decline", { near: TITLE, exact: true });
  await morgan.waitFor("Decline this proposal");
  await morgan.type('[id^="decline-note-"]', "Not this quarter: say which report it is for.");
  await morgan.click("Decline", { within: "[role=dialog]", exact: true, wait: 2500 });
  step("declining shows the toast", await morgan.waitFor("Declined. The proposer has your note."));
  const [declined] = await query("select proposal_status from tasks where id = $1", [created.id]);
  step("the proposal is declined in the database", declined?.proposal_status === "declined");

  // --- 4. Taylor reads the note and sends it again --------------------------------------------------------------
  await taylor.goto(`/tasks/${created.id}`, 4000);
  step("the task page shows the declined strip with the note", (await taylor.waitFor("Proposal declined")) && (await taylor.has("say which report it is for")));
  step("a declined proposal has no update form", !(await taylor.has("Save update")));
  await taylor.click("Send again", { exact: true, wait: 2500 });
  step("sending again shows the toast", await taylor.waitFor("Sent for sign-off again."));
  step("the strip says it waits again", await taylor.waitFor("waiting for any leader or admin to sign off"));
  await taylor.shot("04-stakeholder-resubmitted", { full: true });

  // --- 5. Morgan approves from the task page -------------------------------------------------------------------
  await morgan.goto(`/tasks/${created.id}`, 4000);
  step("the leader sees Approve on the task page", await morgan.waitFor("Approve"));
  await morgan.click("Approve", { exact: true, wait: 2500 });
  step("approving shows the toast", await morgan.waitFor("Approved. It is a live task now."));
  const [live] = await query("select proposal_status, status from tasks where id = $1", [created.id]);
  step("the task is live and not started", live?.proposal_status === "approved" && live?.status === "not_started", JSON.stringify(live));
  await jordan.goto("/home?view=list", 4000);
  step("the task is in the task list now", await jordan.waitFor(TITLE));
  const activity = await query("select kind from task_activity where task_id = $1 order by created_at", [created.id]);
  step(
    "the history reads created, declined, resubmitted, signed, approved",
    activity.map((row) => row.kind).join(",") === "created,proposal_declined,proposal_resubmitted,proposal_signed,proposal_approved",
    activity.map((row) => row.kind).join(","),
  );
  const notices = await query("select u.name, n.kind, n.title from notifications n join users u on u.id = n.user_id where n.created_at >= $1 and n.title like $2 order by n.created_at", [started, `%${TITLE}%`]);
  step("Taylor heard declined and approved", notices.filter((row) => row.name === "Taylor Ops" && row.kind === "proposal_decided").length === 2, JSON.stringify(notices));
  step("the leaders heard about it twice (proposed, sent again)", notices.filter((row) => row.kind === "proposal_waiting").length >= 2);

  // --- 6. Lumen Health's chain: Sam proposes, Morgan then Avery sign ----------------------------------------------
  const [lumen] = await query(`select id from projects where org_id = (${org}) and name = 'Lumen Health'`);
  step("the seed has the Lumen Health project with sign-off on", Boolean(lumen?.id));
  const sam = (browsers.sam = await openBrowser({ role: "member2", width: 1280, height: 900 }));
  await sam.goto(`/projects/${lumen.id}`, 4000);
  step("the project page shows that new tasks need sign-off", (await sam.waitFor("Lumen Health")) && (await sam.has("Sign-off")));
  await sam.type("#quick-add-title", LUMEN_TITLE);
  await sam.click("Add local task", { exact: true, wait: 2500 });
  step("a member's task in an approve-only project starts local, theirs alone", await sam.waitFor("Saved as a local task"));
  const [lumenTask] = await query("select id, proposal_status from tasks where title = $1", [LUMEN_TITLE]);
  step("it is local in the database", lumenTask?.proposal_status === "local", JSON.stringify(lumenTask));
  await sam.goto(`/tasks/${lumenTask.id}`, 4000);
  await sam.waitFor("Local task");
  await sam.click("Send for sign-off", { exact: true, wait: 2500 });
  step("sending it from its page makes it a proposal", await sam.waitFor("Sent for sign-off."));
  const lumenChain = await query("select a.position, u.name, a.decision from task_approvals a join users u on u.id = a.user_id where a.task_id = $1 order by a.position", [lumenTask.id]);
  step("its chain is Morgan then Avery", lumenChain.map((row) => row.name).join(",") === "Morgan Lead,Avery Admin", JSON.stringify(lumenChain));
  await morgan.goto("/proposals", 4000);
  await morgan.click("Approve", { near: LUMEN_TITLE, exact: true, wait: 2500 });
  step("Morgan's signature moves it to the next person", await morgan.waitFor("Signed off. It waits for the next person."));
  step("and it leaves Morgan's Waiting for you", await morgan.waitForNear("Waiting for you", LUMEN_TITLE, { gone: true }));
  const avery = (browsers.avery = await openBrowser({ role: "admin", width: 1280, height: 900 }));
  await avery.goto("/proposals", 4000);
  step("Avery sees it under Waiting for you with Morgan's tick", (await avery.waitForNear("Waiting for you", LUMEN_TITLE)) && (await avery.hasNear(LUMEN_TITLE, "Morgan Lead")));
  await avery.shot("04-admin-step-two", { full: true });
  await avery.click("Approve", { near: LUMEN_TITLE, exact: true, wait: 2500 });
  step("Avery's signature makes it live", await avery.waitFor("Approved. It is a live task now."));
  const [lumenLive] = await query("select proposal_status from tasks where id = $1", [lumenTask.id]);
  step("the Lumen task is live in the database", lumenLive?.proposal_status === "approved");

  // --- 7. Jordan skips Lumen's queue ----------------------------------------------------------------------------
  await jordan.goto(`/projects/${lumen.id}`, 4000);
  await jordan.type("#quick-add-title", BYPASS_TITLE);
  await jordan.click("Add task", { exact: true, wait: 2500 });
  step("someone on the bypass list makes a live task at once", await jordan.waitFor("Task created."));
  const [bypassed] = await query("select proposal_status from tasks where title = $1", [BYPASS_TITLE]);
  step("it was never a proposal", bypassed?.proposal_status === null, JSON.stringify(bypassed));

  // --- 8. another workspace sees nothing -------------------------------------------------------------------------
  const riley = (browsers.riley = await openBrowser({ role: "other", width: 1280, height: 900 }));
  await riley.goto(`/tasks/${created.id}`, 4000);
  step("Riley (Other Co) gets Not found by id", (await riley.waitFor("Not found")) && !(await riley.has(TITLE)));
  await riley.goto("/proposals", 4000);
  step("Riley's proposals hold none of ours", (await riley.waitFor("Proposals")) && !(await riley.has(TITLE)) && !(await riley.has(LUMEN_TITLE)));
} catch (error) {
  await stoppedOn(error, "04", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
