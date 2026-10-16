import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const dashboard = read("../app/components/dashboard.tsx");
const styles = read("../app/viewport-refinement.css");
const page = read("../app/page.tsx");
const layout = read("../app/layout.tsx");

test("first-time verified users receive a full-width screen, not a missing-sidebar grid column", () => {
  assert.match(dashboard, /className="appShell appShellOnboarding"/);
  assert.match(styles, /\.appShell\.appShellOnboarding\s*\{[\s\S]*?display:\s*block/);
  assert.match(styles, /\.appShellOnboarding\s*>\s*\.content\s*\{[\s\S]*?width:\s*100%/);
  assert.match(styles, /\.appShellOnboarding\s+\.contentWidth\s*\{[\s\S]*?width:\s*min\(100%,\s*860px\)/);
  assert.match(styles, /\.appShellOnboarding\s+\.inlineForm\s*\{[\s\S]*?minmax\(0,\s*1fr\)/);
});

test("account confirmation return refreshes session and leads into sign in when needed", () => {
  assert.match(page, /window\.addEventListener\("pageshow", syncReturnedSession\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(page, /window\.addEventListener\("focus", syncReturnedSession\)/);
  assert.match(page, /window\.removeEventListener\("pageshow", syncReturnedSession\)/);
  assert.match(page, /if \(data\.user\) setUser\(data\.user\)/);
  assert.match(page, /setMode\("signin"\)/);
  assert.match(page, /After confirming, return here to sign in/);
});

test("laptop and mobile form layouts allow document scrolling without zooming out", () => {
  assert.match(styles, /\.authV3\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible/);
  assert.match(styles, /\.authV3Right\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(styles, /@media \(min-width: 761px\) and \(max-height: 750px\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.authV3\.authV3Loading\s*\{\s*grid-template-columns:/);
});

test("restrained welcome styling loads last and preserves blue/gold identity", () => {
  assert.ok(layout.indexOf('import "./viewport-refinement.css"') > layout.indexOf('import "./signature-finish.css"'));
  assert.match(styles, /\.appShell\s+\.twSignatureWelcome\s*\{/);
  assert.match(styles, /\.authV3Story\s*\{/);
  assert.match(styles, /#143366/);
  assert.match(styles, /#d5b56f/);
});
