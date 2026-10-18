// Sign in as a test persona in headless Chrome and look at a screen (test mode — see lib/test-mode.ts).
// Needs `npm run dev` running (port 3020) and `npm run test:seed` done once.
//
// Usage: node scripts/test-browser.mjs <persona|public> [path] [--width=390] [--height=844] [--dark] [--wait=3500] [--out=name] [--full] [--base=http://localhost:3015]
//   personas: admin, lead, member, member2, stakeholder (Trackwise Demo) · other (Other Co admin) · public (nobody)
//   --dark emulates prefers-color-scheme: dark (the app follows the system theme by default)
//   e.g. node scripts/test-browser.mjs leader /home --width=1280 --height=900
//        node scripts/test-browser.mjs admin /settings/organization --dark
// Prints any horizontal overflow and console errors, and saves a screenshot to .test-shots/ (git-ignored). Read the PNG to look at it.
//
// It can also be imported to script a flow across several signed-in browsers (scripts/test-walkthrough/ has several):
//   import { openBrowser } from "./scripts/test-browser.mjs"
//   const admin = await openBrowser({ role: "admin", width: 1280, height: 900 })
//   await admin.goto("/settings/organization"); await admin.waitFor("Members"); await admin.click("Remove", { near: "Sam Dev" }); await admin.shot("removed")
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The same order Next.js resolves a variable in: the environment, then .env.local, then .env.
// The value only ever goes into the sign-in URL.
export function readEnv(key) {
  if (process.env[key] !== undefined) return process.env[key];
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const match = readFileSync(file, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    if (match !== null) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

export function testSecret() {
  const secret = readEnv("TEST_MODE_SECRET");
  if (secret === undefined || secret.length < 16) {
    throw new Error("TEST_MODE_SECRET is missing from .env (16+ characters) — see lib/test-mode.ts");
  }
  return secret;
}

// Git Bash on Windows rewrites an argument like /dashboard into C:/Program Files/Git/dashboard — undo that.
export function cleanPath(given) {
  return given.replace(/^[A-Za-z]:[\\/]Program Files[\\/]Git/i, "");
}

export const DEFAULT_BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3015";

// Keep in step with TEST_PERSONAS in lib/test-mode.ts (scripts cannot import TypeScript).
export const PERSONAS = ["admin", "leader", "member", "member2", "stakeholder", "other"];

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((candidate) => candidate !== undefined && existsSync(candidate));
  if (found === undefined) throw new Error("Chrome not found — set CHROME_PATH");
  return found;
}

// Page-side helpers, injected into every evaluate that scopes by `near`.
//
// `near` names something on the screen (a member's name, an email, a team's name) and means "the block that
// belongs to it". blockFor finds the element with that text — headings first, so "Engineering" is the team card's
// title and not the same word in a member's subtitle — then walks up until a block holds a control that matches.
// It never walks past a block that has more headings than the anchor's own: that would be a wider section (every
// team at once), and clicking the first match there is exactly how a script ends up pressing another row's button.
const PAGE_HELPERS = `
  const visible = (e) => e.offsetParent !== null
  const textOf = (e) => (e.textContent ?? "").replace(/\\s+/g, " ").trim().toLowerCase()
  const headings = (e) => e.querySelectorAll("h1, h2, h3, h4").length
  const anchorFor = (near) => {
    const wanted = near.toLowerCase()
    const pools = [[...document.querySelectorAll("h1, h2, h3, h4")], [...document.querySelectorAll("strong, span, p, label, td, th, li, div")]]
    for (const pool of pools) {
      const exact = pool.find(e => visible(e) && textOf(e) === wanted)
      if (exact !== undefined) return exact
      const leaf = pool.find(e => visible(e) && e.children.length <= 1 && textOf(e).includes(wanted))
      if (leaf !== undefined) return leaf
    }
    return null
  }
  // the smallest ancestor of the anchor in which \`accepts\` is true, without crossing into a wider section
  const blockFor = (near, accepts) => {
    const anchor = anchorFor(near)
    if (anchor === null) return null
    const limit = Math.max(1, headings(anchor))
    let block = anchor
    while (block !== null && block !== document.body && !accepts(block)) {
      const parent = block.parentElement
      if (parent === null || headings(parent) > limit) return null
      block = parent
    }
    return block === document.body ? null : block
  }
  // the whole card / row / panel the anchor sits in: as high as it goes without meeting a second heading
  const sectionFor = (near) => {
    const anchor = anchorFor(near)
    if (anchor === null) return null
    const limit = Math.max(1, headings(anchor))
    let block = anchor
    while (block.parentElement !== null && block.parentElement !== document.body && headings(block.parentElement) <= limit) block = block.parentElement
    return block
  }
  // React only listens once it has hydrated the element; typing or clicking before that is lost. Plain links work regardless.
  const hydrated = (e) => e.tagName === "A" || Object.keys(e).some(k => k.startsWith("__reactProps"))
  const controls = (root) => [...root.querySelectorAll("button, a, [role=button], [role=option], [role=tab], [role=menuitem], [role=menuitemradio], label")]
  const fieldIn = (root, target) => /^([#.\\[]|[a-z]+\\[)/.test(target)
    ? [...root.querySelectorAll(target)].find(e => visible(e) && hydrated(e))
    : [...root.querySelectorAll("input, textarea")].find(e => visible(e) && hydrated(e) && (e.placeholder ?? "").toLowerCase().includes(target.toLowerCase()))
`;

// dark: emulate prefers-color-scheme: dark (next-themes follows the system theme when nothing is chosen)
export async function openBrowser({ role = "public", width = 390, height = 844, dark = false, baseUrl = DEFAULT_BASE_URL } = {}) {
  const isMobile = width < 900;
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = path.join(os.tmpdir(), `trackwise-test-profile-${port}`);
  const chrome = spawn(
    findChrome(),
    [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "about:blank"],
    { stdio: "ignore" }
  );

  let wsUrl;
  for (let attempt = 0; attempt < 60 && wsUrl === undefined; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      wsUrl = targets.find((target) => target.type === "page")?.webSocketDebuggerUrl;
    } catch {
      /* chrome is still starting */
    }
    if (wsUrl === undefined) await sleep(200);
  }
  if (wsUrl === undefined) throw new Error("Chrome did not start");

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));

  let nextId = 1;
  const pending = new Map();
  const problems = [];
  const dialogs = [];
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      problems.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ").slice(0, 300));
    }
    // Long enough to reach the part of a hydration error that says what differed.
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      problems.push(`exception: ${details.exception?.description ?? details.text}`.slice(0, 2500));
    }
    // window.confirm (if any screen uses it) is answered yes, and kept in `dialogs`.
    if (message.method === "Page.javascriptDialogOpening") {
      dialogs.push(message.params.message);
      void send("Page.handleJavaScriptDialog", { accept: true });
    }
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: isMobile ? 2 : 1, mobile: isMobile });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  if (isMobile) {
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await send("Emulation.setUserAgentOverride", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
  }

  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

  // Run a page-side lookup until it succeeds, for up to `timeout` ms — a button may be a re-render away.
  const attempt = async (expression, timeout) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      const result = await evaluate(expression);
      if (result === true || Date.now() >= deadline) return result === true;
      await sleep(300);
    }
  };

  const browser = {
    role,
    dark,
    baseUrl,
    problems,
    dialogs,
    evaluate,
    // Raw Chrome DevTools Protocol access (e.g. Network.setCookie) for checks the page itself cannot do.
    send,

    // The first visit signs the persona in through /api/test-login and lands on the path; later visits are plain navigations.
    async goto(pagePath = "/", wait = 3500) {
      let url = `${baseUrl}${pagePath}`;
      if (role !== "public" && browser.signedIn !== true) {
        url = `${baseUrl}/api/test-login?as=${role}&secret=${encodeURIComponent(testSecret())}&to=${encodeURIComponent(pagePath)}`;
        browser.signedIn = true;
      }
      await send("Page.navigate", { url });
      await sleep(wait);
      return browser.path();
    },

    // Where the browser is now. The secret is taken out: when a sign-in is refused the address is still the sign-in URL, and it must not end up in a log.
    path: async () =>
      ((await evaluate("location.pathname + location.search + location.hash")) ?? "").replace(/([?&]secret=)[^&#]*/, "$1***"),

    // Click the first visible, enabled button / link / tab whose text, title or aria-label contains the label.
    //   exact:   the whole text must match ("Delete", not "Delete my account…")
    //   within:  a CSS selector to look inside
    //   near:    text on screen (a member's name, an email) — the click stays inside that thing's own block, see PAGE_HELPERS
    //   timeout: how long to keep looking before giving up (the control may be a re-render away)
    async click(label, { wait = 1500, exact = false, within = null, near = null, timeout = 8_000 } = {}) {
      const clicked = await attempt(`(() => {
        ${PAGE_HELPERS}
        const wanted = ${JSON.stringify(label)}.toLowerCase()
        const matches = (e) => {
          if (!visible(e) || e.disabled || !hydrated(e)) return false
          const text = textOf(e)
          const aria = ((e.getAttribute("aria-label") ?? "") + " " + (e.getAttribute("title") ?? "")).trim().toLowerCase()
          return ${exact} ? text === wanted || aria === wanted : text.includes(wanted) || aria.includes(wanted)
        }
        const within = ${JSON.stringify(within)}
        const near = ${JSON.stringify(near)}
        let root = within === null ? document : document.querySelector(within)
        if (near !== null) root = blockFor(near, (block) => controls(block).some(matches))
        if (root === null || root === undefined) return false
        const el = controls(root).find(matches)
        if (el === undefined) return false
        el.scrollIntoView({ block: "center" })
        // Radix menus and selects open on pointerdown, not click: send the whole press, then the click.
        const press = { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", isPrimary: true }
        el.dispatchEvent(new PointerEvent("pointerdown", press))
        el.dispatchEvent(new MouseEvent("mousedown", press))
        el.dispatchEvent(new PointerEvent("pointerup", press))
        el.dispatchEvent(new MouseEvent("mouseup", press))
        el.click()
        return true
      })()`, timeout);
      await sleep(wait);
      return clicked;
    },

    // Type into an input found by its placeholder, or by a CSS selector, the way React expects (native setter + input event).
    async type(target, text, { wait = 300, near = null, timeout = 8_000 } = {}) {
      const typed = await attempt(`(() => {
        ${PAGE_HELPERS}
        const target = ${JSON.stringify(target)}
        const near = ${JSON.stringify(near)}
        const root = near === null ? document : blockFor(near, (block) => fieldIn(block, target) !== undefined)
        if (root === null) return false
        const el = fieldIn(root, target)
        if (el === undefined) return false
        el.scrollIntoView({ block: "center" })
        el.focus()
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(text)})
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
        return true
      })()`, timeout);
      await sleep(wait);
      return typed;
    },

    // Choose an option of a native <select> (by its value or visible text); near scopes it as for click.
    async select(target, option, { wait = 500, near = null, timeout = 8_000 } = {}) {
      const chosen = await attempt(`(() => {
        ${PAGE_HELPERS}
        const target = ${JSON.stringify(target)}
        const option = ${JSON.stringify(option)}.toLowerCase()
        const near = ${JSON.stringify(near)}
        const usable = (block) => [...block.querySelectorAll(target)].some(e => visible(e) && !e.disabled && hydrated(e))
        const root = near === null ? document : blockFor(near, usable)
        if (root === null) return false
        const el = [...root.querySelectorAll(target)].find(e => visible(e) && !e.disabled && hydrated(e))
        if (el === undefined) return false
        const match = [...el.options].find(o => o.value.toLowerCase() === option || o.textContent.trim().toLowerCase() === option)
        if (match === undefined) return false
        el.scrollIntoView({ block: "center" })
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, match.value)
        el.dispatchEvent(new Event("change", { bubbles: true }))
        return true
      })()`, timeout);
      await sleep(wait);
      return chosen;
    },

    // The text of the card / row / panel that some text belongs to (null when the anchor is not on screen).
    async textNear(near) {
      return evaluate(`(() => {
        ${PAGE_HELPERS}
        const block = sectionFor(${JSON.stringify(near)})
        return block === null ? null : block.innerText
      })()`);
    },

    // Is this text inside that block? ("Lead" inside the row for "Morgan Lead", not anywhere on the page.)
    async hasNear(near, fragment) {
      const text = await browser.textNear(near);
      return text !== null && text !== undefined && text.toLowerCase().includes(fragment.toLowerCase());
    },

    // Wait until a block shows (or, with { gone: true }, stops showing) some text.
    async waitForNear(near, fragment, { timeout = 15_000, gone = false } = {}) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const has = await browser.hasNear(near, fragment);
        if (gone ? !has : has) return true;
        await sleep(300);
      }
      return false;
    },

    // Press a key on whatever has focus (Enter submits most inline forms here).
    async press(key, wait = 800) {
      await evaluate(`(() => {
        const el = document.activeElement ?? document.body
        for (const type of ["keydown", "keypress", "keyup"]) el.dispatchEvent(new KeyboardEvent(type, { key: ${JSON.stringify(key)}, code: ${JSON.stringify(key)}, bubbles: true }))
        return true
      })()`);
      await sleep(wait);
    },

    text: () => evaluate("document.body.innerText"),

    async has(fragment) {
      return ((await evaluate("document.body.innerText")) ?? "").toLowerCase().includes(fragment.toLowerCase());
    },

    // Wait until the page shows some text (a toast, a heading). Generous by default: on a dev server the first visit to a route also compiles it.
    async waitFor(fragment, timeout = 15_000) {
      const wanted = fragment.toLowerCase();
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const body = (await evaluate("document.body.innerText")) ?? "";
        if (body.toLowerCase().includes(wanted)) return true;
        await sleep(300);
      }
      return false;
    },

    // Wait for whichever of several texts shows first and say which it was (null on timeout).
    async waitForAny(fragments, timeout = 15_000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const body = ((await evaluate("document.body.innerText")) ?? "").toLowerCase();
        const found = fragments.find((fragment) => body.includes(fragment.toLowerCase()));
        if (found !== undefined) return found;
        await sleep(250);
      }
      return null;
    },

    async waitForGone(fragment, timeout = 15_000) {
      const wanted = fragment.toLowerCase();
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const body = (await evaluate("document.body.innerText")) ?? "";
        if (!body.toLowerCase().includes(wanted)) return true;
        await sleep(300);
      }
      return false;
    },

    // Wait until the address starts with a prefix, or matches a pattern (a redirect after an action).
    async waitForPath(wanted, timeout = 45_000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const current = (await evaluate("location.pathname")) ?? "";
        if (wanted instanceof RegExp ? wanted.test(current) : current.startsWith(wanted)) {
          await sleep(1200);
          return true;
        }
        await sleep(400);
      }
      return false;
    },

    // Let a redirect (and a first compile) settle: the address stops changing and the page has real content.
    async settle(timeout = 30_000) {
      const deadline = Date.now() + timeout;
      let last = await browser.path();
      while (Date.now() < deadline) {
        await sleep(500);
        const next = await browser.path();
        const body = (await browser.text()) ?? "";
        if (next === last && body.trim().length > 60) return next;
        last = next;
      }
      return last;
    },

    // Elements that stick out past the screen edge (ignores intentional horizontal scrollers).
    overflow: () =>
      evaluate(`(() => {
        const out = []
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0 || (r.right <= innerWidth + 1 && r.left >= -1)) continue
      // screen-reader-only text is clipped on purpose
      if (getComputedStyle(el).clip === "rect(0px, 0px, 0px, 0px)" || el.closest(".sr-only") !== null) continue
          let p = el.parentElement, inScroller = false
          while (p !== null && p !== document.body) {
            const s = getComputedStyle(p)
            if (s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "hidden" || s.overflowX === "clip") { inScroller = true; break }
            p = p.parentElement
          }
          if (!inScroller) out.push(el.tagName.toLowerCase() + "." + String(el.className).slice(0, 60) + " [" + Math.round(r.left) + "-" + Math.round(r.right) + "]")
        }
        return out.slice(0, 10)
      })()`),

    async shot(name, { full = false } = {}) {
      mkdirSync(".test-shots", { recursive: true });
      const file = path.join(".test-shots", `${name}.png`);
      // The dev-tools badge sits on top of the page (over the first phone tab); hide it unless it is showing an error.
      await evaluate(`(() => { const p = document.querySelector("nextjs-portal"); if (p && !/unhandled|runtime error|build error/i.test(p.shadowRoot?.textContent ?? "")) p.style.display = "none" })()`);
      if (full) {
        const tall = await evaluate("Math.min(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight), 7000)");
        await send("Emulation.setDeviceMetricsOverride", { width, height: Math.max(height, tall), deviceScaleFactor: 1, mobile: isMobile });
        await sleep(600);
      }
      const capture = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(capture.result.data, "base64"));
      if (full) await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: isMobile ? 2 : 1, mobile: isMobile });
      await evaluate(`(() => { const p = document.querySelector("nextjs-portal"); if (p) p.style.display = "" })()`);
      return file;
    },

    async close() {
      ws.close();
      chrome.kill();
      await sleep(400);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* windows can hold the folder for a moment */
      }
    },
  };

  return browser;
}

// command line use
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [role = "public", rawPath = "/", ...flags] = process.argv.slice(2);
  const pagePath = cleanPath(rawPath);
  const flag = (name, fallback) => flags.find((f) => f.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;

  const dark = flags.includes("--dark");
  const browser = await openBrowser({
    role,
    width: Number(flag("width", 390)),
    height: Number(flag("height", 844)),
    dark,
    baseUrl: flag("base", DEFAULT_BASE_URL),
  });
  try {
    const landed = await browser.goto(pagePath, Number(flag("wait", 3500)));
    const size = `${flag("width", 390)}x${flag("height", 844)}`;
    const name = flag("out", `${role}${pagePath.replace(/[^a-z0-9]+/gi, "-")}`.replace(/-$/, "") + `-${size}${dark ? "-dark" : ""}`);
    console.log(`landed on: ${landed}`);
    console.log(`overflow:  ${JSON.stringify(await browser.overflow())}`);
    console.log(`errors:    ${JSON.stringify(browser.problems)}`);
    console.log(`saved:     ${await browser.shot(name, { full: flags.includes("--full") })}`);
  } finally {
    await browser.close();
  }
}
