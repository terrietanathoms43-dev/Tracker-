// Every screen as every persona (docs/PLAN.md §2, 2026-11-03 log): no error or blank page, no console errors, no
// horizontal overflow, redirects land where the role allows, and a screenshot of each. Desktop light for all six
// personas, phone dark for a member and a stakeholder, and the public pages signed out. Also: the sidebar offers
// Reports and Proposals to workers, Goals and Proposals (no Reports) to a stakeholder, the project picker sits in
// the navigation, and the old request addresses land on Proposals.
//
// Usage: node scripts/test-walkthrough/02-pages.mjs [--only=workers,stakeholder,other,public] [--base=http://localhost:3021]
import { closePool, finish, only, pageBroken, query, step, withBrowser } from "./lib.mjs";

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844, dark: true };

/** Seeded rows of Trackwise Demo, looked up so the script survives a reseed. */
const org = "select id from organizations where slug = 'trackwise-demo'";
const one = async (sql) => (await query(sql))[0];
const ids = {
  task: (await one(`select id from tasks where org_id = (${org}) and proposal_status is null and status = 'in_progress' order by created_at limit 1`))?.id,
  project: (await one(`select id from projects where org_id = (${org}) and status = 'active' limit 1`))?.id,
  goal: (await one(`select id from goals where org_id = (${org}) and status = 'active' and parent_goal_id is null limit 1`))?.id,
  subGoal: (await one(`select id from goals where org_id = (${org}) and parent_goal_id is not null limit 1`))?.id,
  proposal: (await one(`select t.id from tasks t join users u on u.id = t.created_by where t.org_id = (${org}) and t.proposal_status = 'pending' and u.email <> 'taylor@trackwise.test' limit 1`))?.id,
  taylorProposal: (await one(`select t.id from tasks t join users u on u.id = t.created_by where t.org_id = (${org}) and t.proposal_status is not null and u.email = 'taylor@trackwise.test' limit 1`))?.id,
};
step("the seed has every row the sweep needs", Object.values(ids).every(Boolean), JSON.stringify(ids));

/** The screens a worker (admin, leader, member) can open. */
const WORKER_SCREENS = [
  "/home",
  "/my-work",
  "/my-work?dateField=completed&from=2026-01-01",
  "/home?view=list",
  "/home?view=list&assignee=me&due=overdue",
  "/home?view=list&dateField=created&from=2026-01-01&to=2026-12-31",
  "/home?view=board",
  `/tasks/${ids.task}`,
  `/tasks/${ids.proposal}`,
  "/home?view=projects",
  "/home?view=draft",
  `/projects/${ids.project}`,
  "/goals",
  "/goals?view=branches",
  `/goals/${ids.goal}`,
  `/goals/${ids.subGoal}`,
  "/members",
  "/proposals",
  "/reports",
  "/reports?cut=exec",
  "/reports?cut=member",
  "/capture",
  "/notifications",
  "/settings",
  "/settings/workspace",
  "/onboarding?new=1",
];
/** A stakeholder's screens, and where the worker-only ones send her. */
const STAKEHOLDER_SCREENS = ["/home", "/goals", "/goals?view=branches", `/goals/${ids.goal}`, `/projects/${ids.project}`, `/tasks/${ids.task}`, "/proposals", `/tasks/${ids.taylorProposal}`, "/reports", "/notifications", "/settings", "/settings/workspace"];
const STAKEHOLDER_REDIRECTS = ["/my-work", "/home?view=list", "/members", "/capture"];
/** Riley's own screens, and the Trackwise Demo ids that must be invisible to Other Co. */
const OTHER_SCREENS = ["/home", "/my-work", "/home?view=list", "/projects", "/goals", "/members", "/proposals", "/reports", "/settings/workspace"];
const OTHER_NOT_FOUND = [`/tasks/${ids.task}`, `/tasks/${ids.proposal}`, `/projects/${ids.project}`, `/goals/${ids.goal}`, `/goals/${ids.subGoal}`];
const PUBLIC_SCREENS = ["/", "/login", "/login/check-email", "/invite/not-a-token"];

const slug = (path) => path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "root";
const pathOnly = (address) => address.split("?")[0];

/** The labels in the main navigation (the sidebar on desktop). */
const navLabels = (browser) =>
  browser.evaluate(`[...document.querySelectorAll('nav[aria-label="Main"] a')].filter((a) => a.checkVisibility()).map((a) => a.textContent.trim())`);

/** Opens a screen and checks it rendered as a real page: not Next's error or not-found page, not blank, no errors, no overflow. */
async function sweep(browser, role, size, path, { expectNotFound = false } = {}) {
  const landed = pathOnly(await browser.goto(path, 3000));
  await browser.settle(20_000);
  const state = await pageBroken(browser);
  const overflow = (await browser.overflow()) ?? [];
  const errors = browser.problems.length;
  browser.problems.length = 0;
  const appNotFound = (await browser.has("That doesn't exist, or you can't see it")) || (await browser.has("This link isn't valid"));
  const ok = expectNotFound
    ? appNotFound && !state.error && errors === 0
    : !state.error && !state.notFound && !state.blank && !appNotFound && errors === 0 && overflow.length === 0;
  const detail = [state.error ? "error page" : "", state.notFound ? "Next not-found" : "", state.blank ? "blank" : "", appNotFound && !expectNotFound ? "app Not found" : "", errors ? `${errors} console errors` : "", overflow.length ? `overflow: ${overflow[0]}` : "", `landed ${landed}`]
    .filter(Boolean)
    .join(" · ");
  step(`${role} ${size} ${path}${expectNotFound ? " → Not found" : ""}`, ok, detail);
  if (!ok) await browser.shot(`02-${role}-${size}-${slug(path)}`);
  return landed;
}

if (only("workers")) {
  console.log("— every screen as every worker —");
  const visits = [["leader", "desktop", DESKTOP], ["admin", "desktop", DESKTOP], ["member", "phone", PHONE]];
  for (const [role, size, viewport] of visits) {
    await withBrowser({ role, ...viewport }, async (browser) => {
      for (const path of WORKER_SCREENS) await sweep(browser, role, size, path);
      if (size === "desktop") {
        await browser.goto("/home", 3000);
        const labels = await navLabels(browser);
        step(`${role} sees Reports and Proposals in the main navigation`, Array.isArray(labels) && labels.includes("Reports") && labels.includes("Proposals"), JSON.stringify(labels));
        step(`${role}'s navigation has no Requests or team entry`, Array.isArray(labels) && !labels.some((label) => /team|request/i.test(label)), JSON.stringify(labels));
        step(`${role} has the project picker in the navigation`, (await browser.evaluate(`document.querySelector('[data-project-scope]') !== null`)) === true);
        const landed = pathOnly(await browser.goto("/requests", 3000));
        step(`${role}: the old requests address lands on Proposals`, landed === "/proposals", `landed ${landed}`);
      } else {
        await browser.goto("/home", 3000);
        step(`${role} on a phone has the project picker in the top bar`, (await browser.evaluate(`document.querySelector('[data-project-scope-button]') !== null`)) === true);
      }
    });
  }
}

if (only("stakeholder")) {
  console.log("\n— a stakeholder's screens and redirects —");
  for (const [size, viewport] of [["desktop", DESKTOP], ["phone", PHONE]]) {
    await withBrowser({ role: "stakeholder", ...viewport }, async (browser) => {
      for (const path of STAKEHOLDER_SCREENS) await sweep(browser, "stakeholder", size, path);
      if (size === "desktop") {
        const labels = await navLabels(browser);
        step("a stakeholder's navigation is Home, Goals, Proposals and Reports", Array.isArray(labels) && labels.join(",") === "Home,Goals,Proposals,Reports", JSON.stringify(labels));
        await browser.goto("/reports?cut=leader", 4000);
        step("a stakeholder's Reports is the Executive view, whatever the address asks for", (await browser.waitFor("Decisions waiting", 20_000)) && !(await browser.has("Workload")) && (await browser.evaluate(`document.querySelector('nav[aria-label="Report view"]') === null`)) === true);
        await browser.goto("/home", 4000);
        step("a stakeholder's Home leads with how the work stands", (await browser.waitFor("How the work stands")) && (await browser.has("Open the full report")));
      }
      for (const path of STAKEHOLDER_REDIRECTS) {
        const landed = pathOnly(await browser.goto(path, 3000));
        step(`stakeholder ${size} ${path} → /home`, landed === "/home", `landed ${landed}`);
      }
    });
  }
}

if (only("other")) {
  console.log("\n— another workspace sees only its own —");
  await withBrowser({ role: "other", ...DESKTOP }, async (browser) => {
    for (const path of OTHER_SCREENS) await sweep(browser, "other", "desktop", path);
    for (const path of OTHER_NOT_FOUND) await sweep(browser, "other", "desktop", path, { expectNotFound: true });
  });
}

if (only("public")) {
  console.log("\n— the public pages —");
  await withBrowser({ role: "public", ...DESKTOP }, async (browser) => {
    for (const path of PUBLIC_SCREENS) await sweep(browser, "public", "desktop", path, { expectNotFound: path.startsWith("/invite/") });
  });
}

await closePool();
finish();
