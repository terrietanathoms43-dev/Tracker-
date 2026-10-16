import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const dashboard=readFileSync(new URL("../app/components/dashboard.tsx",import.meta.url),"utf8");
const theme=readFileSync(new URL("../app/brand-system.css",import.meta.url),"utf8");
const layout=readFileSync(new URL("../app/layout.tsx",import.meta.url),"utf8");

test("new dialog-based navigation preserves Trackwise royal blue and gold",()=>{
 assert.ok(theme.length>3500);
 for(const c of ["#102a63","#234a9e","#f2c56f"])assert.ok(theme.includes(c),c);
 for(const selector of [".appShell .sidebar",".appShell .appHeader",".appShell .twBoardLane",".appShell .reportHero",".authV3FormCard",".authV3MobileBrand"]){
  assert.ok(theme.includes(selector),"Missing brand styling for "+selector);
 }
 assert.ok(layout.indexOf('import "./brand-system.css"')>layout.indexOf('import "./globals.css"'));
});
test("blue gold theme coexists with functioning dashboard, Kanban and dialogs",()=>{
 assert.ok(page.includes("<Dashboard"));
 for(const part of ["<DndContext","<WorkspaceDialog","<UserDialog","<TaskDialog",'className="sectionTabs"','className="stats statsSix"']){
  assert.ok(dashboard.includes(part),"Missing "+part);
 }
 assert.ok(css.includes(".dialogOverlay"));
 assert.doesNotMatch(page,/Budgets\s*&\s*Resources/);
});
