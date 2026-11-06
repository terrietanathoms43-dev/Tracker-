// The Active scope view on Reports (docs/PLAN.md, 2026-11-06 log, the active reporting scope): "what this cycle was
// to work on". As Morgan with Since two weeks back: the tab, the sentence, the six numbers against the database (every
// live task not completed, rejected ones too, plus what was completed on or after that day), the groups problems first and completed last
// with the database's counts, "New this cycle" on the tasks created since the range began, a row naming its project
// and goal, and the CSV with one row per task. Then the navigation's project picker narrows it. Then a member on a
// phone and a stakeholder each get the tab beside their own view, with the whole team's scope, and a member asking
// for the Workload view by address lands on their own.
//
// Usage: node scripts/test-walkthrough/16-active-scope.mjs [--only=leader,project,others] [--base=http://localhost:3021]
import { closePool, finish, only, openBrowser, pickChoice, query, step, stoppedOn } from "./lib.mjs";

const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";
/** Trackwise Demo's timezone, the one the page computes its days in for its members (lib/test-mode.ts). */
const TZ = "America/Jamaica";
const todayOf = async () => (await query(`select to_char(now() at time zone '${TZ}', 'YYYY-MM-DD') as day`))[0].day;
const shiftDay = (day, days) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const GROUPS = ["blocked", "awaiting_approval", "in_progress", "not_started", "rejected", "completed"];
const INTRO = "the work this report cycle was to get through";
const CSV_HEADER = "Title,Project,Goal,Assignees,Status,Due date,Completed on,Added on,New this cycle,Detail";

/**
 * What the page should show since a day (and for a project): the rule of lib/reports/data.ts `activeScopeTasks`
 * and lib/reports/scope.ts written in SQL again, so the page is checked against the database rather than itself.
 * `today` is for what counts as overdue.
 */
async function expected(since, today, projectId = null) {
  const rows = await query(
    `select t.status, count(*)::int as n,
            count(*) filter (where t.created_at >= ($1::date::timestamp at time zone '${TZ}'))::int as added,
            count(*) filter (where t.status not in ('completed', 'rejected') and t.due_date < $2::date)::int as overdue
       from tasks t
      where t.org_id = (${org}) and (t.proposal_status is null or t.proposal_status = 'approved')
        and ($3::text is null or t.project_id = $3::text)
        and (t.status <> 'completed' or t.completed_at >= ($1::date::timestamp at time zone '${TZ}'))
      group by t.status`,
    [since, today, projectId],
  );
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.n]));
  const sum = (key) => rows.reduce((acc, row) => acc + row[key], 0);
  const completed = byStatus.completed ?? 0;
  return {
    total: sum("n"),
    notCompleted: sum("n") - completed,
    completed,
    overdue: sum("overdue"),
    blocked: byStatus.blocked ?? 0,
    added: sum("added"),
    groups: GROUPS.filter((status) => (byStatus[status] ?? 0) > 0).map((status) => [status, byStatus[status]]),
  };
}

const tiles = (browser) => browser.evaluate(`Object.fromEntries([...document.querySelectorAll('[data-scope-tile]')].map((el) => [el.dataset.scopeTile, Number(el.dataset.value)]))`);
const groups = (browser) => browser.evaluate(`[...document.querySelectorAll('[data-scope-group]')].map((el) => [el.dataset.scopeGroup, Number(el.dataset.count)])`);
const tabs = (browser) => browser.evaluate(`[...document.querySelectorAll('nav[aria-label="Report view"] a')].map((a) => a.textContent.trim())`);
const activeTab = (browser) => browser.evaluate(`document.querySelector('nav[aria-label="Report view"] a[aria-current="page"]')?.textContent.trim() ?? null`);
const csvHrefOf = (browser) => browser.evaluate(`document.querySelector('a[aria-label="Download Active scope as CSV"]')?.getAttribute("href") ?? null`);
const numbersMatch = (numbers, want) =>
  numbers["In scope"] === want.total &&
  numbers["Not completed"] === want.notCompleted &&
  numbers["Overdue"] === want.overdue &&
  numbers["Blocked"] === want.blocked &&
  numbers["Completed"] === want.completed &&
  numbers["New this cycle"] === want.added;
const wanted = (want) => JSON.stringify({ total: want.total, notCompleted: want.notCompleted, overdue: want.overdue, blocked: want.blocked, completed: want.completed, added: want.added });

try {
  const today = await todayOf();
  const from = shiftDay(today, -13);
  const address = `/reports?cut=scope&from=${from}&to=${today}`;
  const want = await expected(from, today);
  step("the seed has work not completed and completions in the last two weeks", want.notCompleted > 0 && want.completed > 0, JSON.stringify({ notCompleted: want.notCompleted, completed: want.completed }));

  if (only("leader")) {
    const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
    await morgan.goto(address, 4000);
    await morgan.settle(20_000);
    step("the Active scope tab is the current one", (await activeTab(morgan)) === "Active scope", String(await activeTab(morgan)));
    step("the view says what the list is", await morgan.waitFor(INTRO));
    const numbers = await tiles(morgan);
    step("the six numbers match the database", numbersMatch(numbers, want), `${JSON.stringify(numbers)} for ${wanted(want)}`);
    const shown = await groups(morgan);
    step("the groups come problems first and completed last, with the database's counts, empty ones left out", JSON.stringify(shown) === JSON.stringify(want.groups), `${JSON.stringify(shown)} for ${JSON.stringify(want.groups)}`);
    const chips = await morgan.evaluate(`document.querySelectorAll('[data-scope-task][data-added="yes"]').length`);
    step("New this cycle marks exactly the tasks created since the range began", chips === want.added, `${chips} for ${want.added}`);
    const [placed] = await query(
      `select t.title, p.name as project, g.title as goal from tasks t join projects p on p.id = t.project_id join goals g on g.id = t.goal_id
        where t.org_id = (${org}) and (t.proposal_status is null or t.proposal_status = 'approved') and t.status not in ('completed', 'rejected') order by t.title limit 1`,
    );
    step("a row names its project and goal", placed !== undefined && (await morgan.hasNear(placed.title, `${placed.project} · ${placed.goal}`)), JSON.stringify(placed));
    const completedRows = await morgan.evaluate(`[...document.querySelectorAll('[data-scope-group="completed"] [data-scope-task]')].map((li) => li.textContent)`);
    step("the completed rows say when", Array.isArray(completedRows) && completedRows.length === want.completed && completedRows.every((text) => text.includes("Completed ")), `${completedRows?.length} rows for ${want.completed}`);
    const csvHref = await csvHrefOf(morgan);
    step("the CSV link asks for the scope table over the same range", typeof csvHref === "string" && csvHref.includes("table=scope") && csvHref.includes(`from=${from}`), String(csvHref));
    const csv = await morgan.evaluate(`fetch(${JSON.stringify(csvHref)}).then((r) => r.text())`);
    const lines = typeof csv === "string" ? csv.replace(/^﻿/, "").split("\r\n").filter((line) => line.length > 0) : [];
    step("the CSV has the header and one row per task in scope", lines.length === want.total + 1 && lines[0] === CSV_HEADER, `${lines.length - 1} rows for ${want.total}; ${lines[0]}`);
    await morgan.shot("16-scope-desktop", { full: true });
    step("no console errors on the view", morgan.problems.length === 0, JSON.stringify(morgan.problems.slice(0, 2)));
  }

  if (only("project")) {
    const morgan = browsers.morgan ?? (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
    const [project] = await query(
      `select p.id, p.name from projects p
         join tasks t on t.project_id = p.id and (t.proposal_status is null or t.proposal_status = 'approved') and t.status not in ('completed', 'rejected')
        where p.org_id = (${org}) and p.status = 'active' group by p.id, p.name order by count(*) desc, p.name limit 1`,
    );
    await morgan.goto(address, 4000);
    await morgan.settle(20_000);
    await pickChoice(morgan, "[data-project-scope]", project.name);
    await morgan.goto(address, 4000);
    step("the navigation's project picker narrows the scope", await morgan.waitFor(`Trackwise Demo · ${project.name}`, 20_000));
    await morgan.settle(20_000);
    const wantProject = await expected(from, today, project.id);
    const numbers = await tiles(morgan);
    step("its numbers are that project's alone", numbersMatch(numbers, wantProject), `${JSON.stringify(numbers)} for ${wanted(wantProject)}`);
    const rowsShown = await morgan.evaluate(`document.querySelectorAll('[data-scope-task]').length`);
    step("and so are its rows", rowsShown === wantProject.total, `${rowsShown} for ${wantProject.total}`);
    const csvHref = await csvHrefOf(morgan);
    step("the CSV link carries the project", typeof csvHref === "string" && csvHref.includes(`project=${project.id}`), String(csvHref));
    await pickChoice(morgan, "[data-project-scope]", "All projects", { search: "" });
    await morgan.goto(address, 4000);
    step("All projects widens it again", await morgan.waitFor("Trackwise Demo · All projects", 20_000));
    step("no console errors while narrowing", morgan.problems.length === 0, JSON.stringify(morgan.problems.slice(0, 2)));
  }

  if (only("others")) {
    const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 390, height: 844, dark: true }));
    await jordan.goto(`/reports?cut=leader&from=${from}&to=${today}`, 4000);
    await jordan.settle(20_000);
    step("a member asking for the Workload view lands on My work", (await activeTab(jordan)) === "My work", String(await activeTab(jordan)));
    step("a member's tabs are My work and Active scope", JSON.stringify(await tabs(jordan)) === JSON.stringify(["My work", "Active scope"]), JSON.stringify(await tabs(jordan)));
    await jordan.click("Active scope", { within: 'nav[aria-label="Report view"]' });
    await jordan.settle(20_000);
    step("the member opens the Active scope", await jordan.waitFor(INTRO));
    const numbers = await tiles(jordan);
    step("it is the whole team's scope, not only their own", numbers["In scope"] === want.total, `${JSON.stringify(numbers)} for ${want.total}`);
    const overflow = (await jordan.overflow()) ?? [];
    step("the phone view has no horizontal overflow", overflow.length === 0, JSON.stringify(overflow[0] ?? ""));
    await jordan.shot("16-scope-phone-dark", { full: true });
    step("no console errors on the phone", jordan.problems.length === 0, JSON.stringify(jordan.problems.slice(0, 2)));

    const taylor = (browsers.taylor = await openBrowser({ role: "stakeholder", width: 1280, height: 900 }));
    await taylor.goto(`/reports?from=${from}&to=${today}`, 4000);
    await taylor.settle(20_000);
    step("a stakeholder's tabs are Executive health and Active scope", JSON.stringify(await tabs(taylor)) === JSON.stringify(["Executive health", "Active scope"]), JSON.stringify(await tabs(taylor)));
    await taylor.click("Active scope", { within: 'nav[aria-label="Report view"]' });
    await taylor.settle(20_000);
    const opened = await taylor.waitFor(INTRO);
    const rowsShown = await taylor.evaluate(`document.querySelectorAll('[data-scope-task]').length`);
    step("the stakeholder opens the Active scope with every task in it", opened && rowsShown === want.total, `${rowsShown} rows for ${want.total}`);
    step("no console errors for the stakeholder", taylor.problems.length === 0, JSON.stringify(taylor.problems.slice(0, 2)));
  }
} catch (error) {
  await stoppedOn(error, "16", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  finish();
}
