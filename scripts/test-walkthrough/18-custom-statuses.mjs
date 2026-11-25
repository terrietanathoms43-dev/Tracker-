// Workspace-configurable task statuses (2026-11-11): Settings → Workspace → Task statuses. An admin adds a
// custom status (icon, colour, closed flag), renames a built-in with the two-step confirm, archives a status
// (tasks keep it, pickers lose it), and restores it. A renamed Completed still behaves like Completed.
// The locks hold (work in progress never closes, Not started and Completed can't be archived, no two statuses
// share a name); a task closed into a custom status shows on the Active scope report; history speaks the
// renamed words; an archived open status keeps its board column while tasks still have it. A custom status
// nothing carries can be deleted (built-ins never, in-use never); old history lines name it "a removed status".
//
// Usage: node scripts/test-walkthrough/18-custom-statuses.mjs [--base=http://localhost:3015]
import { closePool, finish, pageBroken, query, sleep, step, withBrowser } from "./lib.mjs";

const DESKTOP = { width: 1280, height: 900 };
const org = "select id from organizations where slug = 'trackwise-demo'";
const started = new Date();

/** Picks a status from the task page's status menu and, when a dialog asks, fills the reason. */
async function changeStatus(browser, label, { reason, title } = {}) {
  await browser.click("Change status", { wait: 800 });
  await browser.click(label, { exact: true, within: "[role=menu]", wait: 1200 });
  if (title) {
    await browser.waitFor(title);
    if (reason) await browser.type("#transition-reason", reason);
    await browser.click(title, { exact: true, within: "[role=dialog]", wait: 2500 });
  }
}

/** Closes the open dialog and waits out its exit animation, so the next click lands on the page. */
async function cancelDialog(browser) {
  await browser.click("Cancel", { exact: true, within: "[role='dialog']" });
  await sleep(600);
}

/** Adds a status through the card's dialog. */
async function addStatus(browser, label, { closed }) {
  await browser.click("Add status");
  await browser.waitFor("A new status the workspace can pick");
  await browser.type("#status-label", label);
  await browser.clickSelector("[aria-label='Icon star']");
  await browser.clickSelector("[aria-label='Colour amber']");
  if (closed) await browser.clickSelector("[role='dialog'] [role='checkbox']");
  await browser.click("Add status", { within: "[role='dialog']" });
}

const [first, second] = await query(`select id, status from tasks where org_id = (${org}) and proposal_status is null and status = 'in_progress' and parent_task_id is null and not goal_closer order by id limit 2`);
const moved = [first, second];

try {
  await withBrowser({ role: "admin", ...DESKTOP }, async (admin) => {
    // --- the card renders ---------------------------------------------------
    await admin.goto("/settings/workspace");
    step("the Task statuses card renders for an admin", await admin.waitFor("Task statuses"));
    step("the nine defaults list", await admin.waitFor("Not started") && await admin.has("Completed"));
    step("built-in closed states are marked", (await admin.text())?.split("closes the task").length - 1 >= 4);
    step(
      "Not started and Completed can't be archived",
      await admin.evaluate(`!document.querySelector("[aria-label='Archive Not started']") && !document.querySelector("[aria-label='Archive Completed']") && !!document.querySelector("[aria-label='Archive Deferred']")`),
    );

    // --- locks ---------------------------------------------------------------
    await admin.clickSelector("[aria-label='Edit In progress']");
    await admin.waitFor("never closes the task");
    step("work in progress can't be made a closed status", await admin.evaluate(`document.querySelector("[role='dialog'] [role='checkbox']")?.disabled === true`));
    await cancelDialog(admin);

    // --- add a custom closed status ----------------------------------------
    await addStatus(admin, "QA gate", { closed: true });
    step("the custom status is added", await admin.waitFor("Status added.") || await admin.waitForNear("Task statuses", "QA gate"));
    step("it is marked closed", await admin.waitForNear("QA gate", "closes the task"));

    await addStatus(admin, "qa gate", { closed: false });
    step("a second status with the same name is refused", await admin.waitFor("already a status called"));
    await cancelDialog(admin);

    await addStatus(admin, "In review", { closed: false });
    step("a custom open status is added", await admin.waitForNear("Task statuses", "In review"));
    step(
      "unused customs can be deleted, built-ins never",
      await admin.evaluate(`!!document.querySelector("[aria-label='Delete QA gate']") && !!document.querySelector("[aria-label='Delete In review']") && !document.querySelector("[aria-label='Delete Not started']") && !document.querySelector("[aria-label='Delete Completed']")`),
    );

    // --- pickers offer it ----------------------------------------------------
    await admin.goto(`/tasks/${first.id}`);
    await admin.waitFor("Current status");
    const options = await admin.evaluate(`(() => [...document.querySelectorAll("option")].map(o => o.textContent.trim()))()`);
    step("the status picker offers the custom status", options?.some((o) => o === "QA gate"), JSON.stringify(options?.slice(0, 12)));

    // --- a task closed into it shows on the report ---------------------------
    await changeStatus(admin, "QA gate", { title: "Mark as QA gate", reason: "Parked until QA signs it off" });
    const [closed] = await query(`select t.status, s.label from tasks t join task_statuses s on s.org_id = t.org_id and s.key = t.status where t.id = $1`, [first.id]);
    step("a custom closed status asks its reason and closes the task", closed?.label === "QA gate", JSON.stringify(closed));
    await admin.goto("/reports?cut=scope", 4000);
    await admin.settle(20_000);
    const groups = await admin.evaluate(`[...document.querySelectorAll("h2, h3")].map((h) => h.textContent.trim())`);
    const broken = await pageBroken(admin);
    step("the Active scope report lists work closed into a custom status", groups?.some((heading) => heading.startsWith("QA gate")) && !broken.error && !broken.blank, JSON.stringify(groups));

    // --- rename a built-in (confirm step) -----------------------------------
    await admin.goto("/settings/workspace");
    await admin.waitFor("Task statuses");
    await admin.clickSelector("[aria-label='Edit Completed']");
    step("the edit dialog opens", await admin.waitFor("how a task finishes"));
    await admin.type("#status-label", "Done deal");
    step("the rename warning shows", await admin.waitFor("Renames it on"));
    await admin.click("Save — renames it everywhere");
    await admin.click("Save", { within: "[role='dialog']" });
    step("the rename saves", await admin.waitFor("Status saved.") || await admin.waitForNear("Task statuses", "Done deal"));

    // The rename travels: a completed task wears the new label, and its history speaks the new name.
    const done = (await query(`select id from tasks where org_id = (${org}) and status = 'completed' order by updated_at desc limit 1`))[0];
    await admin.goto(`/tasks/${done.id}`);
    step("a completed task shows the renamed status", await admin.waitFor("Done deal"));
    step("its history says the renamed words", await admin.waitFor("marked it Done deal"));

    // --- archive: an open status keeps its column while tasks have it --------
    await admin.goto(`/tasks/${second.id}`);
    await admin.waitFor("Current status");
    await changeStatus(admin, "In review");
    await admin.goto("/settings/workspace");
    await admin.waitFor("Task statuses");
    step("a status in use can't be deleted", await admin.evaluate(`!document.querySelector("[aria-label='Delete QA gate']") && !document.querySelector("[aria-label='Delete In review']")`));
    await admin.clickSelector("[aria-label='Archive In review']");
    step("the archive dialog opens", await admin.waitFor("leaves the pickers"));
    await admin.click("Archive", { within: "[role='dialog']" });
    step("the status is archived", await admin.waitFor("archived") && await admin.waitFor("be picked"));

    await admin.goto(`/tasks/${second.id}`);
    await admin.waitFor("Current status");
    const afterArchive = await admin.evaluate(`(() => [...document.querySelectorAll("option")].map(o => o.textContent.trim()))()`);
    step("archived statuses leave the pickers", !afterArchive?.some((o) => o === "In review"));

    await admin.goto("/home?view=board");
    step("the board keeps an archived status's column while a task has it", await admin.waitForNear("In review", "Archived"));

    // --- restore -------------------------------------------------------------
    await admin.goto("/settings/workspace");
    await admin.waitFor("Task statuses");
    await admin.click("Restore");
    step("restore returns it to the list", await admin.waitFor("restored"));

    // --- delete: nothing uses it, history still names it ---------------------
    await admin.goto(`/tasks/${second.id}`);
    await admin.waitFor("Current status");
    await changeStatus(admin, "In progress");
    await admin.goto("/settings/workspace");
    await admin.waitFor("Task statuses");
    await admin.clickSelector("[aria-label='Delete In review']");
    step("the delete dialog warns history keeps a mention", await admin.waitFor("a removed status"));
    await admin.click("Delete", { exact: true, within: "[role='dialog']" });
    step("the status is deleted", await admin.waitFor("deleted."));
    await admin.goto(`/tasks/${second.id}`);
    step("its history says 'a removed status'", await admin.waitFor("a removed status"));
  });
} finally {
  // Rows are a workspace's config, not seed data — put the tasks back and clear them so the run leaves the demo as it was.
  for (const task of moved.filter(Boolean)) {
    await query(`update tasks set status = $2, rejection_reason = null where id = $1`, [task.id, task.status]);
    await query(`delete from task_activity where task_id = $1 and created_at >= $2`, [task.id, started]);
  }
  await query(`delete from task_statuses where org_id = (${org})`);
}

finish();
await closePool();
