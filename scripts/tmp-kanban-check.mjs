// Temporary check: kanban drag affordances — drop-target glow, hovered-column tint, no same-column jostle.
// Signs in the way /api/test-login does (session row + signed cookie + org cookie).
// Run: node scripts/tmp-kanban-check.mjs [--base=http://localhost:3015]
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { BASE_URL, closePool, finish, openBrowser, query, step, tidy } from "./test-walkthrough/lib.mjs";

const browsers = {};

function signedCookie(token) {
   const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
   return `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`;
}

async function pressAt(browser, column, item = 0) {
   const point = await browser.evaluate(`(() => {
      const el = document.querySelectorAll('[data-slot="kanban-column"][data-value="${column}"] [data-slot="kanban-item-handle"]')[${item}];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
   })()`);
   if (!point) return null;
   await browser.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
   return point;
}

async function moveTo(browser, from, to, steps = 12) {
   for (let i = 1; i <= steps; i++) {
      await browser.send("Input.dispatchMouseEvent", {
         type: "mouseMoved",
         x: from.x + ((to.x - from.x) * i) / steps,
         y: from.y + ((to.y - from.y) * i) / steps,
         button: "left",
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
   }
}

async function columnCenter(browser, column) {
   return browser.evaluate(`(() => {
      const el = document.querySelector('[data-slot="kanban-column"][data-value="${column}"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + Math.min(r.height - 20, 200) };
   })()`);
}

async function release(browser, x, y) {
   await browser.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

try {
   const [user] = await query("select id from users where email = 'jordan@trackwise.test'");
   const [membership] = await query(
      "select om.org_id as \"orgId\" from organization_members om join organizations o on o.id = om.org_id where om.user_id = $1 and o.slug = 'trackwise-demo'",
      [user.id],
   );
   step("jordan is seeded", Boolean(user?.id && membership?.orgId));

   const token = randomBytes(32).toString("base64url");
   const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
   await query(
      "insert into sessions (id, token, user_id, expires_at, ip_address, user_agent) values ($1, $2, $3, $4, '', 'kanban-check')",
      [randomUUID(), token, user.id, expiresAt],
   );

   const jordan = (browsers.jordan = await openBrowser({ role: "public", width: 1280, height: 900 }));
   await jordan.send("Network.enable");
   await jordan.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__consoleLog = []; for (const kind of ["error", "warn"]) { const orig = console[kind].bind(console); console[kind] = (...args) => { window.__consoleLog.push(kind + ": " + args.map((a) => (a instanceof Error ? a.stack : String(a))).join(" ")); orig(...args); }; }`,
   });
   await jordan.send("Network.setCookie", {
      name: "better-auth.session_token",
      value: signedCookie(token),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(expiresAt.getTime() / 1000),
   });
   await jordan.send("Network.setCookie", { name: "trackwise.org", value: membership.orgId, url: BASE_URL, sameSite: "Lax" });

   await jordan.goto("/tasks?view=board", 8000);
   step("the board loads", await jordan.waitFor("Not started"));

   // --- mid-drag: other columns glow, hovered column tints, siblings don't shift -----------------------
   const press = await pressAt(jordan, "not_started", 0);
   step("a card to grab exists", press !== null);
   const draggedId = await jordan.evaluate(
      `document.querySelector('[data-slot="kanban-column"][data-value="not_started"] [data-slot="kanban-item"]')?.dataset.value ?? null`,
   );
   const beforeRects = await jordan.evaluate(
      `[...document.querySelectorAll('[data-slot="kanban-column"] [data-slot="kanban-item"]')].map((el) => el.getBoundingClientRect().top)`,
   );

   const blocked = await columnCenter(jordan, "blocked");
   await moveTo(jordan, press, blocked);
   await new Promise((resolve) => setTimeout(resolve, 400));

   const marked = await jordan.evaluate(
      `[...document.querySelectorAll('[data-slot="kanban-column"]')].map((el) => ({ column: el.dataset.value, target: el.dataset.dropTarget === "true", over: el.dataset.over === "true" }))`,
   );
   step(
      "other columns marked drop-target, hovered one marked over",
      Array.isArray(marked) &&
         marked.find((c) => c.column === "blocked")?.over === true &&
         marked.filter((c) => c.column !== "not_started" && c.target).length === 4 &&
         marked.find((c) => c.column === "not_started")?.target !== true,
      JSON.stringify(marked),
   );
   const duringRects = await jordan.evaluate(
      `[...document.querySelectorAll('[data-slot="kanban-column"] [data-slot="kanban-item"]')].map((el) => el.getBoundingClientRect().top)`,
   );
   step(
      "sibling cards do not shift while dragging",
      Array.isArray(duringRects) &&
         duringRects.length === beforeRects.length &&
         beforeRects.every((top, i) => Math.abs(top - duringRects[i]) < 2),
      `${JSON.stringify(beforeRects)} → ${JSON.stringify(duringRects)}`,
   );
   await jordan.shot("kanban-mid-drag");

   // --- same-column drop: nothing moves, nothing saves ------------------------------------------------
   const sameColumn = await columnCenter(jordan, "not_started");
   await moveTo(jordan, blocked, sameColumn);
   await release(jordan, sameColumn.x, sameColumn.y);
   await new Promise((resolve) => setTimeout(resolve, 800));
   const afterRects = await jordan.evaluate(
      `[...document.querySelectorAll('[data-slot="kanban-column"] [data-slot="kanban-item"]')].map((el) => el.getBoundingClientRect().top)`,
   );
   step(
      "dropping back in the same column leaves every card where it was",
      Array.isArray(afterRects) &&
         afterRects.length === beforeRects.length &&
         beforeRects.every((top, i) => Math.abs(top - afterRects[i]) < 2),
      `${JSON.stringify(afterRects)}`,
   );
   const [stillThere] = await query("select status from tasks where id = $1", [draggedId]);
   step("no status change for a same-column drop", stillThere?.status === "not_started", JSON.stringify(stillThere));

   // --- cross-column drop still commits ---------------------------------------------------------------
   const press2 = await pressAt(jordan, "not_started", 0);
   const draggedId2 = await jordan.evaluate(
      `document.querySelector('[data-slot="kanban-column"][data-value="not_started"] [data-slot="kanban-item"]')?.dataset.value ?? null`,
   );
   const inProgress = await columnCenter(jordan, "in_progress");
   await moveTo(jordan, press2, inProgress);
   await release(jordan, inProgress.x, inProgress.y);
   await jordan.waitFor("Status changed.", 10000);
   const [moved] = await query("select status from tasks where id = $1", [draggedId2]);
   step(
      "cross-column drop still changes status on the server",
      moved?.status === "in_progress",
      JSON.stringify({ draggedId2, moved }),
   );

   console.log("\nconsole errors:");
   for (const problem of browsers.jordan.problems) console.log(`  ${problem}`);
   const captured = await jordan.evaluate(`(window.__consoleLog ?? []).join("\\n---\\n")`);
   if (captured) console.log(`\nfull console text:\n${captured}`);
} catch (error) {
   console.log("stopped:", error instanceof Error ? error.message : error);
   process.exitCode = 1;
} finally {
   for (const browser of Object.values(browsers)) {
      try {
         await browser.close();
      } catch {
         /* already gone */
      }
   }
   try {
      await query("delete from sessions where user_agent = 'kanban-check'");
      finish();
      await closePool();
      tidy();
   } catch (error) {
      console.log("tidy failed:", error instanceof Error ? error.message : error);
   }
}
