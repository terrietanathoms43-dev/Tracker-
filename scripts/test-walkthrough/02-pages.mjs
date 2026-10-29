// Every screen as every persona (docs/PLAN.md §2): no error or blank page, no console errors, no horizontal
// overflow, redirects land where the role allows, and a screenshot of each. Desktop light for all six personas,
// phone dark for a member and a stakeholder, and the public pages signed out.
//
// Usage: node scripts/test-walkthrough/02-pages.mjs [--only=workers,stakeholder,other,public] [--base=http://localhost:3021]
import { closePool, finish, only, pageBroken, query, step, withBrowser } from "./lib.mjs";

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844, dark: true };

/** Seeded rows of Trackwise Demo, looked up so the script survives a reseed. */
const org = "select id from organizations where slug = 'trackwise-demo'";
const one = async (sql) => (await query(sql))[0];
const ids = {
  task: (await one(`select id from tasks where org_id = (${org}) and request_id is null and status = 'in_progress' order by created_at limit 1`))?.id,
  project: (await one(`select id from projects where org_id = (${org}) and status = 'active' limit 1`))?.id,
  goal: (await one(`select id from goals where org_id = (${org}) and status = 'active' limit 1`))?.id,
  team: (await one(`select id from teams where org_id = (${org}) order by name limit 1`))?.id,
  request: (await one(`select r.id from requests r join users u on u.id = r.requester_id where r.org_id = (${org}) and u.email <> 'taylor@trackwise.test' limit 1`))?.id,
  taylorRequest: (await one(`select r.id from requests r join users u on u.id = r.requester_id where r.org_id = (${org}) and u.email = 'taylor@trackwise.test' and r.converted_task_id is not null limit 1`))?.id,
};
ids.convertedTask = (await one(`select converted_task_id as id from requests where id = '${ids.taylorRequest}'`))?.id;
step("the seed has every row the sweep needs", Object.values(ids).every(Boolean), JSON.stringify(ids));

/** The screens a worker (admin, leader, member) can open. */
const WORKER_SCREENS = [
  "/home",
  "/my-work",
  "/home?view=list",
  "/home?view=board",
  `/tasks/${ids.task}`,
  "/home?view=projects",
  `/projects/${ids.project}`,
  "/goals",
  `/goals/${ids.goal}`,
  "/members",
  `/teams/${ids.team}`,
  "/requests",
  `/requests/${ids.request}`,
  "/reports",
  "/notifications",
  "/settings",
  "/settings/workspace",
  "/onboarding?new=1",
];
/** A stakeholder's screens, and where the worker-only ones send her. */
const STAKEHOLDER_SCREENS = ["/home", "/requests", `/requests/${ids.taylorRequest}`, `/tasks/${ids.convertedTask}`, "/notifications", "/settings", "/settings/workspace"];
const STAKEHOLDER_REDIRECTS = ["/my-work", "/home?view=list", "/projects", "/goals", "/members", "/reports"];
const STAKEHOLDER_NOT_FOUND = [`/tasks/${ids.task}`, `/projects/${ids.project}`, `/goals/${ids.goal}`, `/teams/${ids.team}`, `/requests/${ids.request}`];
/** Riley's own screens, and the Trackwise Demo ids that must be invisible to Other Co. */
const OTHER_SCREENS = ["/home", "/my-work", "/home?view=list", "/projects", "/goals", "/members", "/requests", "/reports", "/settings/workspace"];
const OTHER_NOT_FOUND = [`/tasks/${ids.task}`, `/projects/${ids.project}`, `/goals/${ids.goal}`, `/teams/${ids.team}`, `/requests/${ids.request}`];
const PUBLIC_SCREENS = ["/", "/login", "/login/check-email", "/invite/not-a-token"];

const slug = (path) => path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "root";
const pathOnly = (address) => address.split("?")[0];

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
    });
  }
}

if (only("stakeholder")) {
  console.log("\n— a stakeholder's screens, redirects and Not founds —");
  for (const [size, viewport] of [["desktop", DESKTOP]]) {
    await withBrowser({ role: "stakeholder", ...viewport }, async (browser) => {
      for (const path of STAKEHOLDER_SCREENS) await sweep(browser, "stakeholder", size, path);
      for (const path of STAKEHOLDER_REDIRECTS) {
        const landed = pathOnly(await browser.goto(path, 3000));
        step(`stakeholder ${size} ${path} → /home`, landed === "/home", `landed ${landed}`);
      }
      for (const path of STAKEHOLDER_NOT_FOUND) await sweep(browser, "stakeholder", size, path, { expectNotFound: true });
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
