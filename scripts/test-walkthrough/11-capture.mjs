// Capture from a meeting, on the Draft tab (docs/PLAN.md, 2026-11-01 and 2026-11-04 logs). As a leader: jot notes, get a draft, see the project,
// the goal, the tasks with their people, dates and the words they came from; untick one; create the rest; land on
// the project with the tasks, the goal, the history note and the assignee's notification in the database. A member
// and a stakeholder are turned away, and neither the add bar nor the palette offers it to them. Test personas get
// the plain parser (lib/capture/fake.ts), so nothing is sent to a model.
//
// Usage: node scripts/test-walkthrough/11-capture.mjs [--only=flow,offers,guards,phone] [--base=http://localhost:3021]
import { closePool, finish, only, openBrowser, query, sleep, step, stoppedOn, tidy } from "./lib.mjs";

const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";

const NOTES = `Meeting: Incident review, November
Project: Incident tooling
Morgan: Let's go through what we agreed.
Goal: Nobody is paged twice for the same incident
Action item: Jordan will publish the on-call handbook by Friday
Action item: Sam to rotate the paging webhook secret by 2026-11-14 (urgent)
Action item: Morgan will draft the paging escalation policy next week
Taylor: Thanks all.`;

/** Titles no seeded task has, so the database checks below find only what this run created. */
const TITLES = ["Publish the on-call handbook", "Rotate the paging webhook secret", "Draft the paging escalation policy"];

try {
  const [project] = await query(`select id, name from projects where org_id = (${org}) and name = 'Incident tooling'`);
  step("the seed has the Incident tooling project", Boolean(project?.id));

  if (only("flow")) {
    const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
    await morgan.goto("/capture", 4000);
    step("the old capture address lands on the Draft tab", await morgan.waitForPath("/home", 20_000));
    step("a leader sees the notepad and Turn into work", (await morgan.waitFor("Turn it into work", 20_000)) && (await morgan.evaluate(`document.querySelector("#draft-body") !== null`)));
    await morgan.type("#draft-body", "");
    await sleep(300);
    step("the button waits for notes", (await morgan.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Turn into work")?.disabled`)) === true);

    // --- 1. draft --------------------------------------------------------------------------------------------------
    await morgan.type("#draft-body", NOTES);
    step("the notes save themselves", await morgan.waitForSelector('[data-draft-save][data-save-state="saved"]', 10_000));
    await morgan.click("Turn into work", { exact: true, wait: 1000 });
    step("test personas are told the plain parser stands in", await morgan.waitFor("Test mode"));
    await morgan.click("Draft the plan from these notes", { exact: true, wait: 1500 });
    step("the draft comes back for review", await morgan.waitFor("Will create", 30_000));
    await morgan.shot("11-review", { full: true });
    step("the meeting's name was read", (await morgan.evaluate(`document.querySelector("#capture-title")?.value`)) === "Incident review, November");
    step("the project named in the notes is picked, as an existing project", (await morgan.evaluate(`document.querySelector("#capture-project-existing")?.value`)) === project.id);
    const goalTitle = await morgan.evaluate(`document.querySelector('[data-draft-goal] input[aria-label="Goal title"]')?.value`);
    step("the new goal is proposed as a new, top-level goal", goalTitle === "Nobody is paged twice for the same incident", String(goalTitle));
    const titles = await morgan.evaluate(`[...document.querySelectorAll('[data-draft-task] input[aria-label="Task title"]')].map((i) => i.value)`);
    step("three action items became tasks", JSON.stringify(titles) === JSON.stringify(TITLES), JSON.stringify(titles));
    step("the first task is assigned to the person named", await morgan.hasNear(TITLES[0], "Jordan Dev"));
    step("the urgent one is urgent", (await morgan.evaluate(`[...document.querySelectorAll('[data-draft-task]')][1]?.querySelector('select[aria-label="Priority"]')?.value`)) === "urgent");
    step("its date was read from the notes", (await morgan.evaluate(`[...document.querySelectorAll('[data-draft-task]')][1]?.querySelector('input[aria-label="Due date"]')?.value`)) === "2026-11-14");
    step("every task shows the words it came from", (await morgan.evaluate(`[...document.querySelectorAll('[data-draft-task] blockquote')].length`)) === 3);
    step("the footer says what will be created", await morgan.has("Will create 1 goal and 3 tasks"));

    // --- 2. edit and approve ---------------------------------------------------------------------------------------------
    await morgan.click(`Include task ${TITLES[2]}`, { exact: true, wait: 600 });
    step("unticking a task takes it out of the count", await morgan.waitFor("Will create 1 goal and 2 tasks"));
    await morgan.click("Create 1 goal and 2 tasks", { exact: true, wait: 3000 });
    step("creating shows the toast", await morgan.waitFor("Created 1 goal and 2 tasks from Incident review, November.", 30_000));
    step("and lands on the project", await morgan.waitForPath(`/projects/${project.id}`));
    await morgan.shot("11-created", { full: true });

    // --- 3. what the database says -----------------------------------------------------------------------------------------
    const created = await query(
      `select t.title, t.priority, t.due_date::text as due, t.description, t.project_id, g.title as goal, g.parent_goal_id,
              (select string_agg(u.name, ', ' order by u.name) from task_assignees a join users u on u.id = a.user_id where a.task_id = t.id) as people
         from tasks t left join goals g on g.id = t.goal_id
        where t.org_id = (${org}) and t.title = any($1::text[]) order by t.title`,
      [TITLES],
    );
    step("two tasks were created in the project, not the unticked one", created.length === 2 && created.every((row) => row.project_id === project.id), JSON.stringify(created.map((row) => row.title)));
    const runbook = created.find((row) => row.title === TITLES[0]);
    const rotate = created.find((row) => row.title === TITLES[1]);
    step("each is assigned to the person the notes named", runbook?.people === "Jordan Dev" && rotate?.people === "Sam Dev", JSON.stringify([runbook?.people, rotate?.people]));
    step("the urgent one kept its priority and date", rotate?.priority === "urgent" && rotate?.due === "2026-11-14", JSON.stringify([rotate?.priority, rotate?.due]));
    step("both point at the new top-level goal", created.every((row) => row.goal === "Nobody is paged twice for the same incident" && row.parent_goal_id === null));
    step("the task keeps the words it came from", typeof runbook?.description === "string" && runbook.description.includes("Jordan will publish the on-call handbook"), runbook?.description ?? "");
    const history = await query(
      `select a.kind, a.note from task_activity a join tasks t on t.id = a.task_id where t.org_id = (${org}) and t.title = $1 order by a.created_at`,
      [TITLES[0]],
    );
    step("the history says it was captured from the meeting", history.some((row) => row.kind === "created" && (row.note ?? "").includes("Captured from Incident review")), JSON.stringify(history));
    step("and that it was assigned", history.some((row) => row.kind === "assigned"));
    const notice = await query(
      `select n.title from notifications n join users u on u.id = n.user_id where u.email = 'jordan@trackwise.test' and n.title = $1`,
      [`New task for you: ${TITLES[0]}`],
    );
    step("the person assigned was told", notice.length === 1, JSON.stringify(notice));
    step("no console errors on the way", morgan.problems.length === 0, JSON.stringify(morgan.problems.slice(0, 2)));

  }

  if (only("offers")) {
    const morgan = (browsers.offers = await openBrowser({ role: "leader", width: 1280, height: 900 }));
    await morgan.goto("/my-work", 3000);
    step("the add bar offers From a meeting to a leader", await morgan.waitFor("From a meeting"));
    await morgan.goto(`/projects/${project.id}`, 3000);
    await morgan.waitFor(project.name);
    const href = await morgan.evaluate(`[...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "From a meeting")?.getAttribute("href")`);
    step("the project page's button starts from that project", href === `/capture?project=${project.id}`, String(href));
    await morgan.click("Search", { wait: 1200 });
    step("the palette offers it too", await morgan.waitFor("Capture from a meeting"));
    await morgan.press("Escape", 500);
  }

  if (only("guards")) {
    const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 1280, height: 900 }));
    await jordan.goto("/capture", 3500);
    // The redirect lands on the Draft tab, which a cold dev server may still be compiling: wait for the address, not a moment.
    step("a member lands on their own Draft tab, without Turn into work", (await jordan.waitForPath("/home")) && (await jordan.waitFor("Jot anything", 20_000)) && !(await jordan.has("Turn into work")), await jordan.path());
    await jordan.goto("/my-work", 3000);
    await jordan.waitFor("More options");
    await sleep(1500);
    step("the add bar does not offer it to a member", !(await jordan.has("From a meeting")));
    await jordan.click("Search", { wait: 1200 });
    await jordan.waitFor("New task");
    step("nor does the palette", !(await jordan.has("Capture from a meeting")));
    await jordan.press("Escape", 500);

    const taylor = (browsers.taylor = await openBrowser({ role: "stakeholder", width: 1280, height: 900 }));
    await taylor.goto("/capture", 3500);
    step("a stakeholder is sent home", (await taylor.waitForPath("/home")) && (await taylor.waitFor("How the work stands", 20_000)) && !(await taylor.has("Turn into work")), await taylor.path());
  }

  if (only("phone")) {
    const avery = (browsers.avery = await openBrowser({ role: "admin", width: 390, height: 844, dark: true }));
    await avery.goto("/home?view=draft", 4000);
    step("an admin on a phone opens the Draft tab", (await avery.waitFor("Turn it into work", 20_000)) && (await avery.evaluate(`document.querySelector("#draft-body") !== null`)));
    await avery.type("#draft-body", NOTES);
    await avery.waitForSelector('[data-draft-save][data-save-state="saved"]', 10_000);
    await avery.click("Turn into work", { exact: true, wait: 1000 });
    await avery.click("Draft the plan from these notes", { exact: true, wait: 1500 });
    step("the review fits a phone", await avery.waitFor("Will create", 30_000));
    const overflow = (await avery.overflow()) ?? [];
    step("without horizontal overflow", overflow.length === 0, JSON.stringify(overflow[0] ?? ""));
    await avery.shot("11-review-phone-dark", { full: true });
    step("no console errors on the phone", avery.problems.length === 0, JSON.stringify(avery.problems.slice(0, 2)));
  }
} catch (error) {
  await stoppedOn(error, "11", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
