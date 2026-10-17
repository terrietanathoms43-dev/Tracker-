// Signs in as every persona and checks where each one lands and what their navigation offers; that the front door
// routes by audience (visitors see the landing and are sent to sign in, signed-in people go past the landing); that
// the active-workspace cookie is checked against membership; that the test sign-in itself refuses a wrong secret, an
// unknown persona and an off-site redirect; and that signing out from the account menu ends the session.
//
// Depends only on the shell, /home, /login and the landing page, so it can run from Step A onwards.
//
// Usage: node scripts/test-walkthrough/01-sign-in.mjs [--only=landing,routing,org,guard,signout] [--base=http://localhost:3021]
import {
  BASE_URL,
  closePool,
  finish,
  firstName,
  HOME,
  note,
  only,
  openBrowser,
  ORG,
  ORG_COOKIE,
  orgOf,
  OTHER_ORG,
  PERSONAS,
  query,
  SESSION_COOKIE,
  sleep,
  step,
  testSecret,
  withBrowser,
} from "./lib.mjs";

// docs/PLAN.md §2: the sidebar on desktop; four tabs plus More on a phone.
const DESKTOP_NAV = {
  full: ["Home", "My Work", "Tasks", "Goals", "Team", "Requests"],
  stakeholder: ["Home", "Requests"],
};
const PHONE_NAV = {
  full: ["Home", "My Work", "Tasks", "Goals", "More"],
  stakeholder: ["Home", "Requests", "More"],
};
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

const pathOnly = (address) => address.split("?")[0].split("#")[0];

/** The labels of the visible main navigation (sidebar on desktop, bottom tabs on a phone), once it has streamed in. */
async function navLabels(browser, timeout = 20_000) {
  const read = () =>
    browser.evaluate(`[...document.querySelectorAll('nav[aria-label="Main"] a, nav[aria-label="Main"] button')]
      .filter((e) => e.checkVisibility()).map((e) => e.innerText.trim()).filter(Boolean)`);
  const deadline = Date.now() + timeout;
  let labels = (await read()) ?? [];
  while (labels.length === 0 && Date.now() < deadline) {
    await sleep(300);
    labels = (await read()) ?? [];
  }
  return labels;
}

/**
 * Where signing out sent the browser: the current history entry, which keeps the address asked for even when that
 * page failed to load (Auth.js redirects to AUTH_URL's origin, which may be a server that is not running).
 */
async function signOutTarget(browser, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let current = null;
  while (Date.now() < deadline) {
    const history = (await browser.send("Page.getNavigationHistory")).result;
    const entry = history?.entries?.[history.currentIndex];
    current = entry ? new URL(entry.url) : null;
    if (current?.pathname === "/login") {
      await sleep(1000);
      return current;
    }
    await sleep(400);
  }
  return current;
}

const isLocal = (url) => ["localhost", "127.0.0.1"].includes(url.hostname);

const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

if (only("landing")) {
  console.log("— every persona lands on home with the right navigation —");
  const visits = [...PERSONAS.map((role) => [role, "desktop"]), ["member", "phone"], ["stakeholder", "phone"]];
  for (const [role, size] of visits) {
    const viewport = size === "desktop" ? DESKTOP : PHONE;
    await withBrowser({ role, ...viewport }, async (browser) => {
      const landed = pathOnly(await browser.goto(HOME, 4000));
      const org = orgOf(role);
      const greeted = (await browser.waitFor(org.name, 30_000)) && (await browser.waitFor(firstName(role), 10_000));
      const wrongOrg = org === ORG ? OTHER_ORG : ORG;
      const leaked = await browser.has(wrongOrg.name);
      const expected = (size === "desktop" ? DESKTOP_NAV : PHONE_NAV)[role === "stakeholder" ? "stakeholder" : "full"];
      const labels = await navLabels(browser);
      step(
        `${role} lands on ${HOME} in ${org.name} (${size})`,
        landed === HOME && greeted && !leaked,
        [landed, greeted ? "" : `missing ${org.name} or ${firstName(role)}`, leaked ? `shows ${wrongOrg.name}` : ""].filter(Boolean).join(" · "),
      );
      step(`${role} sees ${expected.join(" · ")} (${size})`, sameList(labels, expected), labels.join(" · "));
      if (browser.problems.length > 0) note(`console: ${JSON.stringify(browser.problems.slice(0, 3))}`);
      await browser.shot(`01-${role}-${size}`);
    });
  }
}

if (only("routing")) {
  console.log("\n— the front door routes by audience —");
  const visits = [
    // persona, the page asked for, where they must end up, what that proves
    ["public", "/", "/", "a visitor sees the landing page with Sign in"],
    ["public", HOME, "/login", "a visitor asking for the app is sent to sign in"],
    ["leader", "/", HOME, "a signed-in leader on the landing page goes to home"],
    ["stakeholder", "/", HOME, "a signed-in stakeholder on the landing page goes to home"],
  ];
  const browsers = new Map();
  try {
    for (const [role, asked, expected, proves] of visits) {
      if (!browsers.has(role)) browsers.set(role, await openBrowser({ role, ...DESKTOP }));
      const browser = browsers.get(role);
      await browser.goto(asked, 2500);
      const landed = pathOnly(await browser.settle());
      let ok = landed === expected;
      if (ok && role === "public" && asked === "/") ok = await browser.waitFor("Sign in", 10_000);
      if (ok && expected === "/login") ok = await browser.waitFor("Sign in", 10_000);
      step(proves, ok, `${role}: ${asked} -> ${landed}`);
    }
  } finally {
    for (const browser of browsers.values()) await browser.close();
  }
}

if (only("org")) {
  console.log("\n— the active-workspace cookie is checked against membership —");
  const [demo] = await query("select id from organizations where slug = $1", [ORG.slug]);
  const [other] = await query("select id from organizations where slug = $1", [OTHER_ORG.slug]);
  if (demo === undefined || other === undefined) {
    step("both demo workspaces exist", false, "run npm run test:seed");
  } else {
    // [persona, cookie value planted, workspace they must still see, workspace they must not see, what it proves]
    const cases = [
      ["member", other.id, ORG, OTHER_ORG, "Jordan with Other Co's id in the cookie still sees Trackwise Demo"],
      ["other", demo.id, OTHER_ORG, ORG, "Riley with Trackwise Demo's id in the cookie still sees Other Co"],
      ["leader", "not-a-workspace", ORG, OTHER_ORG, "a garbage workspace cookie falls back to the persona's workspace"],
    ];
    for (const [role, planted, expected, forbidden, proves] of cases) {
      await withBrowser({ role, ...DESKTOP }, async (browser) => {
        await browser.goto(HOME, 3500);
        await browser.waitFor(expected.name, 20_000);
        await browser.send("Network.setCookie", { name: ORG_COOKIE, value: planted, url: BASE_URL, httpOnly: true, path: "/" });
        const landed = pathOnly(await browser.goto(HOME, 3500));
        const shows = await browser.waitFor(expected.name, 20_000);
        const leaked = await browser.has(forbidden.name);
        step(proves, landed === HOME && shows && !leaked, [landed, leaked ? `showed ${forbidden.name}` : "", shows ? "" : `missing ${expected.name}`].filter(Boolean).join(" · "));
      });
    }
  }
}

if (only("guard")) {
  console.log("\n— the test sign-in route itself —");
  const secret = testSecret();
  const wrong = secret.slice(0, -1) + (secret.endsWith("x") ? "y" : "x");
  const base = new URL(BASE_URL);
  const probe = async (queryString) => {
    const response = await fetch(`${BASE_URL}/api/test-login?${queryString}`, { redirect: "manual" });
    const json = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
    const location = response.headers.get("location") ?? "";
    const target = location ? new URL(location, BASE_URL) : null;
    const cookies = response.headers.getSetCookie().map((cookie) => cookie.split("=")[0]);
    return { status: response.status, target, cookies, error: json?.error ?? "" };
  };
  const landsHome = (result) => result.target !== null && result.target.host === base.host && result.target.pathname === HOME;
  const shown = (result) => `${result.status}${result.target ? ` -> ${result.target.href}` : ""}${result.error ? ` (${result.error})` : ""}`;

  let result = await probe(`as=leader&secret=${encodeURIComponent(wrong)}`);
  step("a wrong secret gets a plain 404", result.status === 404 && result.cookies.length === 0, shown(result));
  result = await probe("as=leader");
  step("no secret gets a plain 404", result.status === 404 && result.cookies.length === 0, shown(result));
  result = await probe(`as=owner&secret=${encodeURIComponent(secret)}`);
  step("an unknown persona is refused with 400", result.status === 400 && result.cookies.length === 0, shown(result));
  result = await probe(`as=member&secret=${encodeURIComponent(secret)}`);
  step(
    "a good sign-in sets the session and workspace cookies and lands on home",
    (result.status === 307 || result.status === 302) && landsHome(result) && result.cookies.includes(SESSION_COOKIE) && result.cookies.includes(ORG_COOKIE),
    `${shown(result)} · cookies: ${result.cookies.join(", ")}`,
  );
  for (const offsite of ["https://evil.example/home", "//evil.example", "/\\evil.example"]) {
    result = await probe(`as=member&secret=${encodeURIComponent(secret)}&to=${encodeURIComponent(offsite)}`);
    step(`an off-site 'to' (${offsite}) lands on home instead`, landsHome(result), shown(result));
  }
  result = await probe(`as=member&secret=${encodeURIComponent(secret)}&to=${encodeURIComponent("/login?from=test")}`);
  step("a same-site 'to' is honoured", result.target?.pathname === "/login" && result.target?.search === "?from=test", shown(result));
}

if (only("signout")) {
  console.log("\n— signing out —");
  await withBrowser({ role: "leader", ...DESKTOP }, async (browser) => {
    await browser.goto(HOME, 3500);
    await browser.waitFor(ORG.name, 20_000);
    const cookies = (await browser.send("Network.getCookies", { urls: [BASE_URL] })).result?.cookies ?? [];
    const token = cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value;
    const opened = await browser.click("Account menu", { wait: 800 });
    const clicked = opened && (await browser.click("Sign out", { exact: true, wait: 500 }));
    const target = clicked ? await signOutTarget(browser) : null;
    const sameOrigin = target !== null && target.origin === new URL(BASE_URL).origin;
    step("signing out from the account menu lands on sign in", target?.pathname === "/login" && (sameOrigin || isLocal(target)), target?.href ?? "no redirect");
    if (target?.pathname === "/login" && !sameOrigin) {
      note(`Auth.js sent the browser to ${target.origin} because AUTH_URL names that origin; start this server with AUTH_URL=${BASE_URL} to stay on it.`);
    }
    const [row] = token === undefined ? [undefined] : await query("select 1 as found from sessions where session_token = $1", [token]);
    step("the session row is gone from the database", token !== undefined && row === undefined, token === undefined ? "no session cookie seen" : "");
    await browser.goto(HOME, 2500);
    const after = pathOnly(await browser.settle());
    step("after signing out, home asks for sign-in again", after === "/login", after);
  });
}

finish();
await closePool();
