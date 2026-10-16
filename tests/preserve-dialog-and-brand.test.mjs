import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell=readFileSync(new URL("../app/components/dialog-shell.tsx",import.meta.url),"utf8");
const dashboard=readFileSync(new URL("../app/components/dashboard.tsx",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../app/components/workspace-dialog.tsx",import.meta.url),"utf8");
const user=readFileSync(new URL("../app/components/user-dialog.tsx",import.meta.url),"utf8");
const branding=readFileSync(new URL("../app/brand-system.css",import.meta.url),"utf8");
const layout=readFileSync(new URL("../app/layout.tsx",import.meta.url),"utf8");

test("workspace, user and task dialogs are preserved",()=>{
 assert.match(dashboard,/<WorkspaceDialog/);
 assert.match(dashboard,/<UserDialog/);
 assert.match(dashboard,/<TaskDialog/);
 assert.match(workspace,/<DialogShell/);
 assert.match(user,/<DialogShell/);
 assert.match(shell,/className="dialogSplit"/);
 assert.match(shell,/className="dialogSidebar"/);
 assert.match(shell,/className="dialogMain"/);
});
test("dialog clicks on icons and nested content do not dismiss parent",()=>{
 assert.doesNotMatch(shell,/window\.addEventListener\("click"/);
 assert.match(shell,/event\.target === event\.currentTarget/);
 assert.match(shell,/dialogs\.item\(dialogs\.length - 1\) !== overlayRef\.current/);
 assert.match(shell,/event\.preventDefault\(\)/);
 assert.match(shell,/document\.body\.style\.overflow = "hidden"/);
});
test("dark blue and warm gold branding remains global including login",()=>{
 assert.match(layout,/import "\.\/brand-system\.css"/);
 for(const selector of [".authV3Story",".authV3FormCard",".appShell .sidebar",".appShell .appHeader",".appShell .mobileTopbar",".appShell .twBoardLane",".appShell .reportHero"]){
  assert.ok(branding.includes(selector),"Missing "+selector);
 }
 assert.match(branding,/#102a63/i);
 assert.match(branding,/#f2c56f/i);
});
