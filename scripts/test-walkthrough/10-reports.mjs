// The reworked Reports page (docs/PLAN.md, 2026-11-01 log). As the admin on the Executive view: the verdict strip
// says what is wrong, Decisions waiting lists the awaiting tasks and the unanswered requests with the counts the
// database gives, the health board puts the bad news first and folds the on-track rows away, the daily chart draws
// one segment per task, looks two weeks ahead, opens with today in view and keeps a hovered day on show after the
// pointer leaves. Then the project selector narrows every section and the CSV links, and a member's phone view
// draws only their own work.
//
// Usage: node scripts/test-walkthrough/10-reports.mjs [--only=exec,project,member] [--base=http://localhost:3021]
import { closePool, finish, only, openBrowser, query, step, stoppedOn } from "./lib.mjs";

const browsers = {};
const org = "select id from organizations where slug = 'trackwise-demo'";
/** Trackwise Demo's calendar day, the way the page computes it for its members (lib/test-mode.ts: America/Jamaica). */
const todayOf = async () => (await query("select to_char(now() at time zone 'America/Jamaica', 'YYYY-MM-DD') as day"))[0].day;
const count = async (sql, params = []) => (await query(sql, params))[0]?.n ?? 0;

try {
  const today = await todayOf();
  const awaiting = await count(`select count(*)::int as n from tasks where org_id = (${org}) and status = 'awaiting_approval'`);
  const requestsWaiting = await count(
    `select count(*)::int as n from requests where org_id = (${org}) and (status in ('new', 'approved') or (status = 'deferred' and (defer_until is null or defer_until <= $1::date)))`,
    [today],
  );
  const completedInWindow = await count(
    `select count(*)::int as n from tasks where org_id = (${org}) and status = 'completed' and completed_at >= ($1::date - 29)::timestamp at time zone 'America/Jamaica'`,
    [today],
  );
  step("the seed has decisions waiting and recent completions", awaiting > 0 && requestsWaiting > 0 && completedInWindow > 0, JSON.stringify({ awaiting, requestsWaiting, completedInWindow }));

  if (only("exec")) {
    const avery = (browsers.avery = await openBrowser({ role: "admin", width: 1280, height: 900 }));
    await avery.goto("/reports?cut=exec", 4000);
    await avery.settle(20_000);

    // --- 1. the verdict ------------------------------------------------------------------------------------------------
    const verdict = await avery.waitForAny(["need attention:", "needs attention:", "Nothing needs intervention"]);
    step("the Executive view opens with a verdict sentence", verdict !== null, verdict ?? "none");
    step("the strip counts decisions waiting", await avery.hasNear("Decisions waiting", String(awaiting + requestsWaiting)));

    // --- 2. decisions waiting ------------------------------------------------------------------------------------------
    step("the awaiting tasks are listed with their evidence", await avery.waitForNear("Waiting for approval", String(awaiting)));
    step("the requests nobody has answered are listed", await avery.waitForNear("Requests waiting for a decision", String(requestsWaiting)));

    // --- 3. the health board, bad news first ------------------------------------------------------------------------------
    const badges = await avery.evaluate(`[...document.querySelectorAll('#health li')].map((li) => li.querySelector('span.rounded-full')?.textContent.trim())`);
    const order = ["Delayed", "At risk", "Needs attention", "On track"];
    const ranks = (badges ?? []).map((label) => order.indexOf(label));
    step("every health row carries a verdict", Array.isArray(badges) && badges.length > 0 && ranks.every((rank) => rank >= 0), JSON.stringify(badges));
    const visibleRanks = await avery.evaluate(
      `[...document.querySelectorAll('#health li')].filter((li) => li.offsetParent !== null).map((li) => ${JSON.stringify(order)}.indexOf(li.querySelector('span.rounded-full')?.textContent.trim()))`,
    );
    step("the rows on show are the ones that need a look, worst first", Array.isArray(visibleRanks) && visibleRanks.every((rank, i, all) => i === 0 || all[i - 1] <= rank), JSON.stringify(visibleRanks));
    const hasFold = await avery.has("on track");
    step("on-track rows fold away behind a disclosure (or there are none to fold)", hasFold || (badges ?? []).every((label) => label !== "On track"));
    await avery.shot("10-exec-top", { full: true });

    // --- 4. the chart: one segment per task, future days, today in view, a sticky inspector -----------------------------
    // Every completion is only drawn once every day is on show (the default view may be zoomed in on a small screen).
    await avery.click("Fit every day of the window", { wait: 600 });
    const segments = await avery.evaluate(`document.querySelectorAll('[data-segment="completed"]').length`);
    step("the chart draws one segment per completed task", segments === completedInWindow, `${segments} segments for ${completedInWindow} completions`);
    step("the chart has days ahead of today", (await avery.evaluate(`document.querySelectorAll('g[data-future]').length`)) >= 14);
    step("a due task ahead is drawn outlined", (await avery.evaluate(`document.querySelectorAll('[data-segment="due"]').length`)) > 0);
    const todayVisible = await avery.evaluate(`(() => {
      const frame = document.querySelector('[data-testid="range-chart-frame"]');
      const column = frame?.querySelector('g[data-day="${today}"] rect');
      if (!frame || !column) return "missing";
      const f = frame.getBoundingClientRect(), c = column.getBoundingClientRect();
      return c.left >= f.left - 1 && c.right <= f.right + 1;
    })()`);
    step("today's column is in view when the chart opens", todayVisible === true, String(todayVisible));
    const fills = await avery.evaluate(`(() => {
      const frame = document.querySelector('[data-testid="range-chart-frame"]');
      const svg = frame?.querySelector("svg");
      if (!frame || !svg) return "missing";
      return Math.abs(svg.getBoundingClientRect().width - frame.getBoundingClientRect().width) <= 2 && frame.scrollWidth <= frame.clientWidth + 1;
    })()`);
    step("the chart fills its card with no scrollbar", fills === true, String(fills));
    step("the activity pulse runs behind the bars", (await avery.evaluate(`document.querySelector('[data-testid="activity-line"]') !== null`)) === true);
    const before = await avery.evaluate(`document.querySelectorAll('g[data-day]').length`);
    await avery.click("Zoom in: fewer days", { wait: 600 });
    const after = await avery.evaluate(`document.querySelectorAll('g[data-day]').length`);
    step("zooming in shows fewer days across the same width", typeof before === "number" && typeof after === "number" && after < before, `${before} → ${after}`);
    await avery.click("Fit every day of the window", { wait: 600 });
    const fitLabel = String(await avery.evaluate(`document.querySelector('[data-testid="range-chart-view"]')?.textContent ?? ""`));
    const fitMatch = fitLabel.match(/(\d+) of (\d+) days/);
    const fitCount = await avery.evaluate(`document.querySelectorAll('g[data-day]').length`);
    step("Fit all shows every day of the window", fitMatch !== null && fitMatch[1] === fitMatch[2] && Number(fitMatch[1]) === fitCount, `${fitLabel} · ${fitCount} columns`);
    // React derives onMouseEnter from a mouseout whose relatedTarget is the element entered (Next renders <body>,
    // so a bare mouseover is left for "the body's mouseout" that never comes). Leave the body for the column.
    await avery.evaluate(`(() => {
      const rect = document.querySelector('g[data-day="${today}"] rect');
      document.body.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: rect }));
      return true;
    })()`);
    step("hovering a day opens its inspector", await avery.waitFor("Click a day to pin it", 5000));
    await avery.evaluate(`(() => {
      const rect = document.querySelector('g[data-day="${today}"] rect');
      rect.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
      return true;
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 600));
    step("the inspector stays once the pointer leaves the bar", (await avery.evaluate(`document.querySelector('[data-testid="day-inspector"]') !== null`)) === true);
    await avery.evaluate(`document.querySelector('g[data-day="${today}"] rect').dispatchEvent(new MouseEvent("click", { bubbles: true }))`);
    step("clicking the day pins it", await avery.waitFor("Pinned", 5000));
    await avery.shot("10-exec-chart", { full: true });
    step("no console errors on the Executive view", avery.problems.length === 0, JSON.stringify(avery.problems.slice(0, 2)));
  }

  if (only("project")) {
    const [project] = await query(`select id, name from projects where org_id = (${org}) and name = 'Onboarding flow'`);
    step("the seed has the Onboarding flow project", Boolean(project?.id));
    const deliveredInProject = await count(
      `select count(*)::int as n from tasks where org_id = (${org}) and project_id = $1 and status = 'completed' and completed_at >= ($2::date - 29)::timestamp at time zone 'America/Jamaica'`,
      [project.id, today],
    );
    const morgan = (browsers.morgan = await openBrowser({ role: "leader", width: 1280, height: 900 }));
    await morgan.goto("/reports?cut=exec", 4000);
    await morgan.settle(20_000);
    step("the project picker offers the project", await morgan.select('select[aria-label="Project"]', project.name));
    const addressed = await (async () => {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        if ((await morgan.path()).includes(`project=${project.id}`)) return true;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return false;
    })();
    step("choosing it writes ?project= to the address", addressed, await morgan.path());
    step("the header says which project the report is about", await morgan.waitFor(`Trackwise Demo · ${project.name}`));
    step("the picker shows it is narrowing (brand tint)", (await morgan.evaluate(`getComputedStyle(document.querySelector('select[aria-label="Project"]')).fontWeight`)) >= "500");
    step("Delivered counts that project's completions", await morgan.waitForNear("Delivered in range", String(deliveredInProject)), `${deliveredInProject} expected`);
    step("requests step aside: they are not tied to a project", await morgan.has("Requests aren't tied to a project"));
    const csvHref = await morgan.evaluate(`document.querySelector('a[aria-label="Download People as CSV"]')?.getAttribute("href")`);
    step("the CSV link carries the project", typeof csvHref === "string" && csvHref.includes(`project=${project.id}`), String(csvHref));
    const healthNames = await morgan.evaluate(`[...document.querySelectorAll('#health li a')].map((a) => a.textContent.trim())`);
    step("the health board keeps the project and the goal it rolls up into", Array.isArray(healthNames) && healthNames.includes(project.name) && healthNames.includes("Ship the self-serve onboarding"), JSON.stringify(healthNames));
    await morgan.shot("10-project-scoped", { full: true });

    await morgan.goto(`/reports?cut=leader&project=${project.id}`, 4000);
    await morgan.settle(20_000);
    step("the Workload view keeps the project across views", await morgan.waitFor(`Trackwise Demo · ${project.name}`));
    const deliveredRows = await morgan.evaluate(`document.querySelector('#delivered-panel')?.closest('section')?.querySelectorAll(':scope > ul > li').length ?? 0`);
    step("its Delivered list has only that project's tasks", deliveredRows === deliveredInProject, `${deliveredRows} rows for ${deliveredInProject}`);
    step("the Custom form would keep the project", (await morgan.evaluate(`document.querySelector('a[href*="project=${project.id}"][href*="from="]') !== null`)) === true);

    await morgan.select('select[aria-label="Project"]', "none");
    step("No project narrows to work outside any project", await morgan.waitFor("Trackwise Demo · Work in no project"));
    step("no console errors while narrowing", morgan.problems.length === 0, JSON.stringify(morgan.problems.slice(0, 2)));
  }

  if (only("member")) {
    const jordan = (browsers.jordan = await openBrowser({ role: "member", width: 390, height: 844, dark: true }));
    await jordan.goto("/reports", 4000);
    await jordan.settle(20_000);
    step("a member gets the My work chart", await jordan.waitFor("My deliveries and what's due next"));
    const mine = await count(
      `select count(*)::int as n from tasks t join task_assignees a on a.task_id = t.id join users u on u.id = a.user_id
         where t.org_id = (${org}) and u.email = 'jordan@trackwise.test' and t.status = 'completed' and t.completed_at >= ($1::date - 29)::timestamp at time zone 'America/Jamaica'`,
      [today],
    );
    const overflow = (await jordan.overflow()) ?? [];
    step("the phone view has no horizontal overflow", overflow.length === 0, JSON.stringify(overflow[0] ?? ""));
    const phoneFit = await jordan.evaluate(`(() => {
      const frame = document.querySelector('[data-testid="range-chart-frame"]');
      const column = frame?.querySelector('g[data-day="${today}"] rect');
      if (!frame || !column) return "missing";
      const f = frame.getBoundingClientRect(), c = column.getBoundingClientRect();
      return frame.scrollWidth <= frame.clientWidth + 1 && c.left >= f.left - 1 && c.right <= f.right + 1;
    })()`);
    step("on a phone the chart fits the width with today in view", phoneFit === true, String(phoneFit));
    await jordan.click("Fit every day of the window", { wait: 600 });
    const mineDrawn = await jordan.evaluate(`document.querySelectorAll('[data-segment="completed"]').length`);
    step("fitted to the window, the chart draws only their own completions", mineDrawn === mine, `${mineDrawn} segments for ${mine}`);
    await jordan.shot("10-member-phone-dark", { full: true });
    step("no console errors on the phone", jordan.problems.length === 0, JSON.stringify(jordan.problems.slice(0, 2)));
  }
} catch (error) {
  await stoppedOn(error, "10", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  finish();
}
