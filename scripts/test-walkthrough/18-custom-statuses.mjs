// Workspace-configurable task statuses (2026-11-11): Settings → Workspace → Task statuses. An admin adds a
// custom status (icon, colour, closed flag), renames a built-in with the two-step confirm, archives a status
// (tasks keep it, pickers lose it), and restores it. A renamed Completed still behaves like Completed.
//
// Usage: node scripts/test-walkthrough/18-custom-statuses.mjs [--base=http://localhost:3015]
import { closePool, finish, query, step, withBrowser } from "./lib.mjs";

const DESKTOP = { width: 1280, height: 900 };
const org = "select id from organizations where slug = 'trackwise-demo'";

await withBrowser({ role: "admin", ...DESKTOP }, async (admin) => {
  // --- the card renders ---------------------------------------------------
  await admin.goto("/settings/workspace");
  step("the Task statuses card renders for an admin", await admin.waitFor("Task statuses"));
  step("the nine defaults list", await admin.waitFor("Not started") && await admin.has("Completed"));
  step("built-in closed states are marked", (await admin.text())?.split("closes the task").length - 1 >= 4);

  // --- add a custom closed status ----------------------------------------
  await admin.click("Add status");
  step("the add dialog opens", await admin.waitFor("A new status the workspace can pick"));
  await admin.type("#status-label", "QA gate");
  await admin.clickSelector("[aria-label='Icon star']");
  await admin.clickSelector("[aria-label='Colour awaiting approval']");
  await admin.clickSelector("[role='checkbox']");
  await admin.click("Add status", { within: "[role='dialog']" });
  step("the custom status is added", await admin.waitFor("Status added.") || await admin.waitForNear("Task statuses", "QA gate"));
  step("it is marked closed", await admin.waitForNear("QA gate", "closes the task"));

  // --- pickers offer it ----------------------------------------------------
  const task = (await query(`select id from tasks where org_id = (${org}) and proposal_status is null and status = 'in_progress' limit 1`))[0];
  await admin.goto(`/tasks/${task.id}`);
  await admin.waitFor("Current status");
  const options = await admin.evaluate(`(() => [...document.querySelectorAll("option")].map(o => o.textContent.trim()))()`);
  step("the status picker offers the custom status", options?.some((o) => o === "QA gate"), JSON.stringify(options?.slice(0, 12)));

  // --- rename a built-in (confirm step) -----------------------------------
  await admin.goto("/settings/workspace");
  await admin.waitFor("Task statuses");
  await admin.clickSelector("[aria-label='Edit Completed']");
  step("the edit dialog opens", await admin.waitFor("how a task finishes"));
  await admin.type("#status-label", "Done deal");
  step("the rename warning shows", await admin.waitFor("renames it on every task"));
  await admin.click("Save — renames it everywhere");
  await admin.click("Save", { within: "[role='dialog']" });
  step("the rename saves", await admin.waitFor("Status saved.") || await admin.waitForNear("Task statuses", "Done deal"));

  // The rename travels: a completed task wears the new label, still behaving like Completed.
  const done = (await query(`select id from tasks where org_id = (${org}) and status = 'completed' order by updated_at desc limit 1`))[0];
  await admin.goto(`/tasks/${done.id}`);
  step("a completed task shows the renamed status", await admin.waitFor("Done deal"));

  // --- archive --------------------------------------------------------------
  await admin.goto("/settings/workspace");
  await admin.waitFor("Task statuses");
  await admin.clickSelector("[aria-label='Archive QA gate']");
  step("the archive dialog opens", await admin.waitFor("leaves the pickers"));
  await admin.click("Archive", { within: "[role='dialog']" });
  step("the status is archived", await admin.waitFor("archived") && await admin.waitFor("be picked"));

  await admin.goto(`/tasks/${task.id}`);
  await admin.waitFor("Current status");
  const afterArchive = await admin.evaluate(`(() => [...document.querySelectorAll("option")].map(o => o.textContent.trim()))()`);
  step("archived statuses leave the pickers", !afterArchive?.some((o) => o === "QA gate"));

  // --- restore + tidy up -----------------------------------------------------
  await admin.goto("/settings/workspace");
  await admin.waitFor("Task statuses");
  await admin.click("Restore");
  step("restore returns it to the list", await admin.waitFor("restored"));
});

// Rows are a workspace's config, not seed data — clear them so the run leaves the demo as it was.
await query(`delete from task_statuses where org_id = (${org})`);

finish();
await closePool();
