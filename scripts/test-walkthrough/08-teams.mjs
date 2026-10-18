// Teams and shared assignment (docs/PLAN.md, 2026-10-18 log): Morgan makes a team of Jordan and Sam, assigns it to a
// seeded task, and Sam finds the task in My Work marked "via" the team, with a notification and edit rights; a task
// Morgan assigns to two people reaches both; the report and its CSV count the team; a member cannot make a team;
// another workspace gets Not found for it; deleting the team takes it off the task and the history keeps its name.
//
// Usage: node scripts/test-walkthrough/08-teams.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, step, stoppedOn, tidy } from "./lib.mjs";

const stamp = Date.now().toString(36);
const TEAM = `Walkthrough team ${stamp}`;
const PAIR_TASK = `Walkthrough pair task ${stamp}`;
const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";

const buttonTexts = (browser) =>
  browser.evaluate(`[...document.querySelectorAll("main button")].filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim())`);
const emailsOf = (rows) => rows.map((row) => row.email).sort().join(",");

try {
  const [seeded] = await query(
    `select t.id, t.title from tasks t where t.org_id = (${org}) and t.request_id is null and t.status = 'in_progress'
       and not exists (select 1 from task_teams tt where tt.task_id = t.id) order by t.created_at limit 1`,
  );
  step("the seed has an in-progress task with no team on it", Boolean(seeded?.id), seeded?.title);

  // --- 1. Morgan creates a team of Jordan and Sam -------------------------------------------------------------------
  const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await morgan.goto("/members", 4000);
  step("the Members page lists the seeded teams and people", (await morgan.waitFor("Frontend")) && (await morgan.has("Platform")) && (await morgan.has("Jordan Dev")));
  await morgan.shot("08-members", { full: true });
  await morgan.click("New team", { exact: true });
  step("the team dialog opens", await morgan.waitFor("A team is a group of members"));
  await morgan.type("#team-name", TEAM);
  await morgan.click("Add Jordan Dev", { within: "[role=dialog]", wait: 300 });
  await morgan.click("Add Sam Dev", { within: "[role=dialog]", wait: 300 });
  await morgan.click("Create team", { exact: true, wait: 2500 });
  step("creating the team shows the toast", await morgan.waitFor("Team created."));
  const [team] = await query("select id, name from teams where name = $1", [TEAM]);
  const members = await query("select u.email from team_members m join users u on u.id = m.user_id where m.team_id = $1", [team?.id ?? ""]);
  step("the team and its two members are in the database", Boolean(team?.id) && emailsOf(members) === "jordan@trackwise.test,sam@trackwise.test", emailsOf(members));
  const teamPath = `/teams/${team.id}`;
  await morgan.goto(teamPath, 4000);
  step("the team page shows its members and no open work yet", (await morgan.waitFor(TEAM)) && (await morgan.has("Sam Dev")) && (await morgan.has("Nothing is assigned to")));
  await morgan.shot("08-team-page", { full: true });

  // --- 2. Morgan assigns the team to a seeded task from the task page -------------------------------------------------
  const taskPath = `/tasks/${seeded.id}`;
  await morgan.goto(taskPath, 4000);
  await morgan.waitFor(seeded.title);
  step("the Details card has the assignees picker", await morgan.click("Assigned to", { exact: true, wait: 800 }));
  step("the picker offers the new team", await morgan.click(TEAM, { within: "[cmdk-list]", wait: 400 }));
  await morgan.press("Escape", 3000);
  step("closing the picker saves and shows the toast", await morgan.waitFor("Assignees changed."));
  const [linked] = await query("select count(*)::int as n from task_teams where task_id = $1 and team_id = $2", [seeded.id, team.id]);
  step("the task now carries the team", linked?.n === 1);
  const [history] = await query("select after from task_activity where task_id = $1 and kind = 'assigned' order by created_at desc limit 1", [seeded.id]);
  step("the history names the team", Array.isArray(history?.after?.teams) && history.after.teams.some((each) => each.name === TEAM), JSON.stringify(history?.after));
  step("the task page shows the team chip", await morgan.waitFor(TEAM));
  await morgan.shot("08-task-with-team", { full: true });

  // --- 3. Sam, who is only on it through the team, finds it in My Work and may edit it -------------------------------
  const sam = (browsers.sam = await openBrowser({ role: "member2", width: 1280, height: 900 }));
  await sam.goto("/my-work", 4000);
  step("Sam's My Work shows the task, marked via the team", await sam.waitForNear(seeded.title, `via ${TEAM}`));
  await sam.shot("08-my-work-via-team");
  await sam.goto("/notifications", 4000);
  step("Sam was told the task is assigned to the team", await sam.waitFor(`Assigned to you: ${seeded.title}`));
  await sam.goto(taskPath, 4000);
  await sam.waitFor(seeded.title);
  step("Sam may edit the task through the team", (await sam.evaluate(`!!document.querySelector('button[title="Click to edit the title"]')`)) === true);
  await sam.goto(`/tasks?team=${team.id}`, 4000);
  step("the task list filters by team", (await sam.waitFor(seeded.title)) && (await sam.evaluate(`document.querySelectorAll("[data-task-link]").length`)) === 1);

  // --- 4. A task with two people on it reaches both -------------------------------------------------------------------
  await morgan.goto("/tasks", 4000);
  await morgan.press("n", 1200);
  step("N opens the New task dialog at once", (await morgan.evaluate(`!!document.querySelector("#task-title")`)) === true);
  await morgan.type("#task-title", PAIR_TASK);
  step("the assignees picker starts as You and opens", await morgan.click("You", { exact: true, within: "[role=dialog]", wait: 800 }));
  await morgan.click("Jordan Dev", { within: "[cmdk-list]", wait: 300 });
  await morgan.click("Sam Dev", { within: "[cmdk-list]", wait: 300 });
  await morgan.click("Morgan Lead", { within: "[cmdk-list]", wait: 300 });
  await morgan.press("Escape", 500);
  await morgan.click("Create task", { exact: true, wait: 2500 });
  step("creating the task shows the toast", await morgan.waitFor("Task created."));
  const [pair] = await query("select id from tasks where title = $1", [PAIR_TASK]);
  const pairPeople = await query("select u.email from task_assignees ta join users u on u.id = ta.user_id where ta.task_id = $1", [pair?.id ?? ""]);
  step("both people are on it and Morgan is not", emailsOf(pairPeople) === "jordan@trackwise.test,sam@trackwise.test", emailsOf(pairPeople));
  const told = await query(
    "select u.email from notifications n join users u on u.id = n.user_id where n.href = $1 and n.kind = 'assigned'",
    [`/tasks/${pair?.id ?? ""}`],
  );
  step("both were told about it", emailsOf(told) === "jordan@trackwise.test,sam@trackwise.test", emailsOf(told));
  const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 390, height: 844, dark: true }));
  await jordan.goto("/my-work", 4000);
  step("Jordan's My Work shows the pair task and the team's task", (await jordan.waitFor(PAIR_TASK)) && (await jordan.has(seeded.title)));
  await jordan.shot("08-my-work-phone-dark", { full: true });

  // --- 5. the report counts the team, in the page and in the CSV -------------------------------------------------------
  await morgan.goto("/reports", 5000);
  step("the report's Teams table lists the team with one open task", await morgan.waitForNear(TEAM, "1"));
  const csv = await morgan.evaluate(`fetch("/reports/export?table=teams").then((r) => r.text())`);
  step("the teams CSV has the team's row", typeof csv === "string" && csv.includes(TEAM), (csv ?? "").split("\n")[0]);

  // --- 6. who may not: a member, and another workspace ------------------------------------------------------------------
  await jordan.goto(teamPath, 4000);
  step("a member reads the team page without Edit or Delete", (await jordan.waitFor(TEAM)) && !(await buttonTexts(jordan)).some((text) => /^(Edit team|Delete)$/.test(text)));
  const riley = (browsers.riley = await openBrowser({ role: "other", width: 1280, height: 900 }));
  await riley.goto(teamPath, 4000);
  step("another workspace gets Not found for the team", await riley.waitFor("Not found"));
  await riley.goto("/members", 4000);
  step("another workspace's Members page has no sign of it", (await riley.waitFor("Members")) && !(await riley.has(TEAM)));

  // --- 7. deleting the team takes it off the task; the history keeps the name ---------------------------------------
  await morgan.goto(teamPath, 4000);
  await morgan.waitFor(TEAM);
  await morgan.click("Delete", { exact: true, wait: 800 });
  await morgan.waitFor(`Delete the team ${TEAM}?`);
  await morgan.click("Delete team", { exact: true, within: "[role=dialog]", wait: 3000 });
  step("deleting shows the toast and goes back to Members", (await morgan.waitFor("deleted.")) && (await morgan.waitForPath("/members", 15_000)));
  const [gone] = await query("select (select count(*)::int from teams where id = $1) as teams, (select count(*)::int from task_teams where team_id = $1) as links", [team.id]);
  step("the team and its task link are gone", gone?.teams === 0 && gone?.links === 0, JSON.stringify(gone));
  const [kept] = await query("select after from task_activity where task_id = $1 and kind = 'assigned' order by created_at desc limit 1", [seeded.id]);
  step("the history still names the team", Array.isArray(kept?.after?.teams) && kept.after.teams.some((each) => each.name === TEAM));
  step("no console errors for the leader", morgan.problems.length === 0, JSON.stringify(morgan.problems.slice(0, 2)));
} catch (error) {
  await stoppedOn(error, "08", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
