// A task's whole life (docs/PLAN.md §5, apex-ux flows A and D) as Jordan, with Morgan approving: create from the
// add bar (N, typed !high @tomorrow, More options for the next action) →
// update progress → block → unblock → send for approval (Morgan by default) → Morgan sends it back → Jordan sees
// "Sent back" in My Work → resubmit → Morgan approves → reopen → comment → add and remove an evidence link → reject
// with a reason. The database then holds every history row and notification, and the people who may not see the
// task get Not found.
//
// Usage: node scripts/test-walkthrough/03-task-flow.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const TITLE = `Walkthrough rotate the API keys ${Date.now().toString().slice(-5)}`;
const started = new Date();
const browsers = {};

/** Fills the Resume card's Update progress form and saves it; `mark` picks a "Mark as" status. */
async function updateProgress(browser, taskId, { progress, next, mark }) {
  await browser.type(`#progress-${taskId}`, progress);
  if (next) await browser.type(`#next-${taskId}`, next);
  if (mark) await browser.select(`#mark-${taskId}`, mark);
  await browser.click("Save update", { exact: true, wait: 2500 });
}

/** Picks a status from the task page's status menu and, when a dialog asks, fills the reason. */
async function changeStatus(browser, label, { reason, title, confirm } = {}) {
  await browser.click("Change status", { wait: 800 });
  await browser.click(label, { exact: true, within: "[role=menu]", wait: 1200 });
  if (title) {
    await browser.waitFor(title);
    if (reason) await browser.type("#transition-reason", reason);
    await browser.click(confirm ?? title, { exact: true, within: "[role=dialog]", wait: 2500 });
  }
}

try {
  // --- 1. create from the add bar ----------------------------------------------------------------------------------
  const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 1280, height: 900 }));
  await jordan.goto("/tasks", 4000);
  await jordan.press("n", 800);
  step("N jumps to the add bar", (await jordan.evaluate(`document.activeElement?.id === "quick-add-title"`)) === true);
  await jordan.type("#quick-add-title", `${TITLE} !high @tomorrow`);
  const picked = await jordan.evaluate(
    `[...document.querySelector("#quick-add-title").form.querySelectorAll("[aria-checked=true], [aria-pressed=true]")].map((e) => e.textContent.trim()).join(",")`,
  );
  step("the bar reads !high and @tomorrow into its buttons", picked === "High,Tomorrow", String(picked));
  await jordan.click("More options", { exact: true, wait: 1200 });
  step("More options opens the dialog with the title, shortcuts taken out", (await jordan.evaluate(`document.querySelector("#task-title")?.value ?? null`)) === TITLE);
  await jordan.type("#task-next", "Draft the rotation runbook");
  await jordan.click("Create task", { exact: true, wait: 2500 });
  step("creating shows the toast", await jordan.waitFor("Task created."));
  step("the add bar is empty again", (await jordan.evaluate(`document.querySelector("#quick-add-title")?.value`)) === "");
  const [created] = await query(
    `select t.id, t.status, t.next_action, t.priority, t.due_date::text as due,
       (select array_agg(ta.user_id) from task_assignees ta where ta.task_id = t.id) as assignees
       from tasks t where t.title = $1`,
    [TITLE],
  );
  const [me] = await query("select id from users where email = 'jordan@trackwise.test'");
  step(
    "the task is Jordan's alone, not started, with its first next action",
    created?.status === "not_started" && Array.isArray(created?.assignees) && created.assignees.length === 1 && created.assignees[0] === me?.id && created?.next_action === "Draft the rotation runbook",
    JSON.stringify(created),
  );
  step("the typed shortcuts set high priority and a due date", created?.priority === "high" && typeof created?.due === "string", JSON.stringify(created));
  const taskPath = `/tasks/${created.id}`;

  // --- 2. update progress on the task page ------------------------------------------------------------------------
  await jordan.goto(taskPath, 4000);
  step("the task page leads with the next action", (await jordan.waitFor(TITLE)) && (await jordan.has("Draft the rotation runbook")));
  await updateProgress(jordan, created.id, { progress: "Runbook drafted and shared.", next: "Review the runbook with Morgan", mark: "in_progress" });
  step("saving an update shows the toast", await jordan.waitFor("Update saved."));
  step("the Resume card shows the new next action", await jordan.waitFor("Review the runbook with Morgan"));
  await jordan.shot("03-after-update", { full: true });

  // --- 3. block and unblock -----------------------------------------------------------------------------------------
  await changeStatus(jordan, "Blocked", { title: "Mark as blocked", reason: "Waiting on the vendor's new key format" });
  step("blocking asks for a reason and shows it on the card", await jordan.waitFor("Waiting on the vendor's new key format"));
  await jordan.shot("03-blocked");
  await jordan.click("Mark unblocked", { exact: true, wait: 2500 });
  // The reason stays in the history, so the proof is the button going away and the row being unblocked.
  await jordan.waitForGone("Mark unblocked");
  const [unblocked] = await query("select status, blocked_reason from tasks where id = $1", [created.id]);
  step("Mark unblocked clears the blocker", unblocked?.status === "in_progress" && unblocked?.blocked_reason === null, JSON.stringify(unblocked));

  // --- 4. send for approval: Morgan by default -------------------------------------------------------------------
  await jordan.select(`#mark-${created.id}`, "awaiting_approval");
  await sleep(500);
  const approver = await jordan.evaluate(`document.querySelector("#approver-${created.id}")?.selectedOptions?.[0]?.textContent ?? null`);
  step("the approver defaults to the leader", typeof approver === "string" && approver.includes("Morgan"), String(approver));
  await updateProgress(jordan, created.id, { progress: "Keys rotated in staging; ready for review.", next: "Switch production once approved" });
  step("sending for approval shows the toast", (await jordan.waitForAny(["Sent for approval.", "Update saved."])) !== null);
  const [awaiting] = await query("select status, approver_id from tasks where id = $1", [created.id]);
  step("the task is awaiting approval with an approver", awaiting?.status === "awaiting_approval" && awaiting?.approver_id !== null, JSON.stringify(awaiting));
  step("the assignee has no Approve button", !(await jordan.has("Send back")));

  // --- 5. Morgan sends it back, Jordan sees it, resubmits, Morgan approves -------------------------------------------
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await morgan.goto(taskPath, 4000);
  step("the leader sees Approve and Send back", (await morgan.waitFor("Approve")) && (await morgan.has("Send back")));
  await morgan.shot("03-awaiting-approval");
  await morgan.click("Send back", { exact: true, wait: 1000 });
  await morgan.waitFor("Send it back");
  await morgan.type("#send-back-note", "Add the rollback step before we switch production.");
  await morgan.click("Send back", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("sending back shows the toast", await morgan.waitFor("Sent back."));

  await jordan.goto("/my-work", 4000);
  step("Jordan's My Work shows it as sent back", await jordan.waitForNear(TITLE, "Sent back"));
  await jordan.shot("03-my-work-sent-back");
  await jordan.goto(taskPath, 4000);
  await jordan.waitFor(TITLE);
  await updateProgress(jordan, created.id, { progress: "Rollback step added.", next: "Switch production once approved", mark: "awaiting_approval" });
  step("resubmitting shows the toast", (await jordan.waitForAny(["Sent for approval.", "Update saved."])) !== null);

  await morgan.goto(taskPath, 4000);
  await morgan.waitFor("Approve");
  await morgan.click("Approve", { exact: true, wait: 2500 });
  step("approving shows the toast", await morgan.waitFor("Approved."));
  const [approved] = await query("select status, completed_at from tasks where id = $1", [created.id]);
  step("the task is completed with a completion time", approved?.status === "completed" && approved?.completed_at !== null, JSON.stringify(approved));
  await morgan.shot("03-approved", { full: true });

  // --- 6. reopen, comment, evidence -------------------------------------------------------------------------------------
  await jordan.goto(taskPath, 4000);
  await jordan.waitFor(TITLE);
  await changeStatus(jordan, "In progress");
  await sleep(2500);
  const [reopened] = await query("select status, completed_at from tasks where id = $1", [created.id]);
  step("reopening clears the completion time", reopened?.status === "in_progress" && reopened?.completed_at === null, JSON.stringify(reopened));

  await jordan.type("Add a comment…", "Production switch is scheduled for Thursday.");
  await jordan.evaluate(`document.querySelector('textarea[aria-label="Add a comment"]').closest("form").requestSubmit()`);
  step("a comment lands in the history", await jordan.waitFor("Production switch is scheduled for Thursday.", 20_000));

  await jordan.click("Add link", { exact: true, wait: 800 });
  await jordan.type("https://…", "https://github.com/example/infra/pull/42");
  await jordan.type("Label (optional)", "PR #42");
  await jordan.click("Add link", { exact: true, wait: 2500 });
  step("an evidence link appears as a chip", await jordan.waitFor("PR #42"));
  await jordan.click("Remove evidence: PR #42", { wait: 2500 });
  // The history still says the link was added, so the proof is the links table.
  const [links] = await query("select count(*)::int as n from task_links where task_id = $1", [created.id]);
  step("and can be removed again", links?.n === 0, `links left: ${links?.n}`);

  // --- 7. reject with a reason ----------------------------------------------------------------------------------------
  await changeStatus(jordan, "Rejected", { title: "Reject this task", reason: "Superseded by the vendor's managed rotation." });
  await sleep(2500);
  const [rejected] = await query("select status, rejection_reason from tasks where id = $1", [created.id]);
  step("rejecting keeps the reason", rejected?.status === "rejected" && rejected?.rejection_reason === "Superseded by the vendor's managed rotation.", JSON.stringify(rejected));
  await jordan.shot("03-rejected", { full: true });

  // --- 8. the history and the notifications ----------------------------------------------------------------------------
  const kinds = (await query("select kind from task_activity where task_id = $1 order by created_at", [created.id])).map((row) => row.kind);
  const wanted = ["created", "progress_updated", "blocked", "unblocked", "approval_requested", "sent_back", "approved", "completed", "reopened", "commented", "link_added", "link_removed", "rejected"];
  step("every event is in the history", wanted.every((kind) => kinds.includes(kind)), `missing: ${wanted.filter((kind) => !kinds.includes(kind)).join(", ") || "none"}`);
  const notices = await query(
    "select u.email, n.kind from notifications n join users u on u.id = n.user_id where n.created_at >= $1 and n.href = $2 order by n.created_at",
    [started, taskPath],
  );
  const kindsFor = (email) => notices.filter((row) => row.email === email).map((row) => row.kind);
  step("the leaders heard about the blocker", kindsFor("morgan@trackwise.test").includes("blocked") && kindsFor("avery@trackwise.test").includes("blocked"), JSON.stringify(notices));
  step("Morgan was asked to approve, twice", kindsFor("morgan@trackwise.test").filter((kind) => kind === "approval_requested").length === 2);
  // Jordan rejected it himself, so only the send-back and the approval reach him (nobody is told about their own change).
  step("Jordan heard the send-back and the approval", kindsFor("jordan@trackwise.test").filter((kind) => kind === "approval_decided").length === 2, JSON.stringify(kindsFor("jordan@trackwise.test")));

  // --- 9. who may not see it --------------------------------------------------------------------------------------------
  const taylor = (browsers.taylor = await openBrowser({ role: "stakeholder", width: 390, height: 844 }));
  await taylor.goto(taskPath, 4000);
  step("a stakeholder gets Not found", await taylor.waitFor("Not found"));
  const riley = (browsers.riley = await openBrowser({ role: "other", width: 1280, height: 900 }));
  await riley.goto(taskPath, 4000);
  step("another workspace gets Not found", await riley.waitFor("Not found"));
} catch (error) {
  await stoppedOn(error, "03", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
