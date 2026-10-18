// A request's whole life (docs/PLAN.md §7, apex-ux flow C): Taylor submits → Morgan defers with a revisit date →
// reopens → approves and creates the task for Jordan → Taylor follows it to the task, read-only → Jordan sees the
// task in My Work with the request linked → every decision and notification is in the database → Riley (Other Co)
// cannot see it by id or in a list.
//
// Usage: node scripts/test-walkthrough/04-requests.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, step, stoppedOn, tidy } from "./lib.mjs";

const TITLE = `Walkthrough quarterly churn export ${Date.now().toString().slice(-5)}`;
const started = new Date();
const browsers = {};

/** A calendar day n days from now as "YYYY-MM-DD", and how the app prints it ("Oct 30"). */
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const shortDay = (day) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const REVISIT = inDays(13);
const DUE = inDays(20);

/** The visible buttons on the page: proves "no decision controls" without matching words like "decided" in prose. */
const buttonTexts = (browser) =>
  browser.evaluate(`[...document.querySelectorAll("main button")].filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim())`);
const DECISION_BUTTONS = /^(Decide|Approve|Defer|Defer again|Reject|Reopen|Convert to task|More)$/;

try {
  // --- 1. Taylor (stakeholder) submits ---------------------------------------------------------------
  const taylor = (browsers.taylor = await openBrowser({ role: "stakeholder", width: 390, height: 844 }));
  await taylor.goto("/requests");
  step("stakeholder lands on her requests", await taylor.waitFor("Your requests"));
  await taylor.click("New request", { exact: true });
  await taylor.waitFor("What do you need?");
  await taylor.type("#request-title", TITLE);
  await taylor.type("#request-outcome", "Finance can see churn by plan without asking engineering.");
  await taylor.click("High", { within: "[role=dialog]", exact: true });
  await taylor.click("Send request", { within: "[role=dialog]" });
  step("submit shows the toast", await taylor.waitFor("Request sent."));
  step("the request appears as New", await taylor.waitForNear(TITLE, "New"));
  const [created] = await query("select id, status, urgency from requests where title = $1", [TITLE]);
  step("the row is new and high urgency", created?.status === "new" && created?.urgency === "high", JSON.stringify(created));
  const requestPath = `/requests/${created.id}`;

  // --- 2. Morgan defers it with a revisit date ------------------------------------------------------------
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await morgan.goto("/requests");
  step("leader sees it under Needs a decision", await morgan.waitForNear(TITLE, "Decide"));
  await morgan.click("Decide", { near: TITLE });
  await morgan.click("Defer…", { exact: true });
  await morgan.waitFor("Defer this request");
  await morgan.type("#decision-defer", REVISIT);
  await morgan.type("#decision-reason", "waiting on budget");
  await morgan.click("Defer", { within: "[role=dialog]", exact: true });
  step("defer shows the toast", await morgan.waitFor("Deferred."));
  step("the row moved to Deferred with its revisit date", await morgan.waitForNear(TITLE, `Revisit ${shortDay(REVISIT)}`));
  await morgan.shot("04-deferred");

  // --- 3. Morgan reopens it from the request page --------------------------------------------------------------
  await morgan.goto(requestPath);
  step("history phrases the deferral", await morgan.waitFor(`deferred it until ${shortDay(REVISIT)}: waiting on budget`));
  await morgan.click("Reopen", { exact: true });
  await morgan.waitFor("Reopen this request");
  await morgan.click("Reopen", { within: "[role=dialog]", exact: true });
  step("reopen shows the toast", await morgan.waitFor("Reopened."));
  step("it is waiting for a decision again", await morgan.waitFor("Waiting for a decision."));

  // --- 4. Morgan approves and creates the task for Jordan ---------------------------------------------------
  await morgan.click("Approve", { exact: true });
  await morgan.waitFor("Approve this request");
  await morgan.click("Create the task now");
  // The assignees picker: a button that opens a searchable list of people and teams (it is disabled until the options load).
  step("the assignees picker opens", await morgan.click("Unassigned", { exact: true, within: "[role=dialog]", wait: 800 }));
  step("and offers Jordan", await morgan.click("Jordan Dev", { within: "[cmdk-list]", wait: 400 }));
  await morgan.press("Escape", 600);
  await morgan.type("#decision-due", DUE);
  await morgan.type("#decision-reason", "Budget landed; Finance needs it for the Q4 review.");
  await morgan.click("Approve and create task", { within: "[role=dialog]" });
  step("approve + create shows the toast", await morgan.waitFor("Converted to a task."));
  step("the request page shows the linked task", await morgan.waitFor("Linked task"));
  await morgan.shot("04-converted-leader", { full: true });

  const [after] = await query("select status, converted_task_id, decision_reason from requests where id = $1", [created.id]);
  const [task] = await query(
    "select t.id, t.title, t.status, t.priority, t.due_date::text as due, t.request_id, (select string_agg(u.name, ', ' order by u.name) from task_assignees ta join users u on u.id = ta.user_id where ta.task_id = t.id) as assignee from tasks t where t.id = $1",
    [after?.converted_task_id],
  );
  step("the request is converted and points at its task", after?.status === "converted" && task?.request_id === created.id, JSON.stringify(after));
  step(
    "the task belongs to Jordan, not started, high priority, due as chosen",
    task?.assignee === "Jordan Dev" && task.status === "not_started" && task.priority === "high" && task.due === DUE,
    JSON.stringify(task),
  );
  const decisions = await query("select decision from request_decisions where request_id = $1 order by created_at", [created.id]);
  step("every decision is in the history, in order", decisions.map((row) => row.decision).join(",") === "deferred,reopened,approved,converted", decisions.map((row) => row.decision).join(","));
  const activity = await query("select kind from task_activity where task_id = $1 order by created_at", [task.id]);
  step("the task's history starts with created + assigned", activity.map((row) => row.kind).join(",") === "created,assigned", activity.map((row) => row.kind).join(","));

  // --- 5. Taylor follows her request to the task -----------------------------------------------------------------
  await taylor.goto(requestPath);
  step("stakeholder sees the linked task with its owner", (await taylor.waitFor("Linked task")) && (await taylor.has("Jordan Dev")));
  step("stakeholder sees the reason", await taylor.has("Budget landed; Finance needs it for the Q4 review."));
  step("stakeholder has no decision controls", !(await buttonTexts(taylor)).some((text) => DECISION_BUTTONS.test(text)), (await buttonTexts(taylor)).join(", "));
  await taylor.shot("04-stakeholder-follows", { full: true });
  await taylor.goto(`/tasks/${task.id}`);
  step("stakeholder can open the task read-only", (await taylor.waitFor(TITLE, 30_000)) && !(await taylor.has("Save update")));

  // --- 6. Jordan sees the task in My Work, with the request link on the task page ------------------------------
  const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 1280, height: 900 }));
  await jordan.goto("/my-work");
  step("assignee sees the task in My Work", await jordan.waitFor(TITLE));
  await jordan.goto(`/tasks/${task.id}`);
  step("the task page links back to the request", (await jordan.evaluate(`!!document.querySelector('a[href="${requestPath}"]')`)) === true);
  await jordan.goto("/requests");
  step("a member sees requests without decision controls", (await jordan.waitFor("Needs a decision")) && !(await buttonTexts(jordan)).some((text) => DECISION_BUTTONS.test(text)));

  // --- 7. notifications --------------------------------------------------------------------------------------------
  const notices = await query(
    "select u.name, n.kind, n.title, n.href from notifications n join users u on u.id = n.user_id where n.created_at >= $1 and n.title like $2 order by n.created_at",
    [started, `%${TITLE}%`],
  );
  const forTaylor = notices.filter((row) => row.name === "Taylor Ops").map((row) => row.title);
  step("Taylor heard deferred, reopened and converted", forTaylor.length === 3 && forTaylor.every((title) => title.startsWith("Your request")), forTaylor.join(" | "));
  const forJordan = notices.find((row) => row.name === "Jordan Dev");
  step("Jordan was told about the task", forJordan?.kind === "assigned" && forJordan.href === `/tasks/${task.id}`, JSON.stringify(forJordan));
  step("nobody else was notified", notices.every((row) => row.name === "Taylor Ops" || row.name === "Jordan Dev"));

  // --- 8. guards --------------------------------------------------------------------------------------------------
  await morgan.goto(requestPath);
  step("a converted request offers no further decisions", !(await buttonTexts(morgan)).some((text) => /^(Approve|Defer|Reject)$/.test(text)));

  // --- 9. another workspace sees nothing by id -------------------------------------------------------------------
  const riley = (browsers.riley = await openBrowser({ role: "other", width: 1280, height: 900 }));
  await riley.goto(requestPath);
  step("Riley (Other Co) gets Not found by id", (await riley.waitFor("Not found")) && !(await riley.has(TITLE)));
  await riley.goto("/requests");
  step("Riley's list doesn't hold it", (await riley.waitFor("Requests")) && !(await riley.has(TITLE)));
} catch (error) {
  await stoppedOn(error, "04", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
