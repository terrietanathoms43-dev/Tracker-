import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const layout=readFileSync(new URL("../app/layout.tsx",import.meta.url),"utf8");
const dashboard=readFileSync(new URL("../app/components/dashboard.tsx",import.meta.url),"utf8");
const polish=readFileSync(new URL("../app/signature-finish.css",import.meta.url),"utf8");
const brand=readFileSync(new URL("../app/brand-system.css",import.meta.url),"utf8");
const user=readFileSync(new URL("../app/components/user-dialog.tsx",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../app/components/workspace-dialog.tsx",import.meta.url),"utf8");
const task=readFileSync(new URL("../app/components/task-dialog.tsx",import.meta.url),"utf8");

test("signature polish is loaded after brand identity while retaining its official tokens",()=>{
 const core=layout.indexOf('import "./globals.css"');
 const brandImport=layout.indexOf('import "./brand-system.css"');
 const signatureImport=layout.indexOf('import "./signature-finish.css"');
 assert.ok(core>=0&&brandImport>core&&signatureImport>brandImport);
 for(const token of ["#102a63","#234a9e","#346bd5","#f2c56f"]){
   assert.ok(polish.includes(token)||brand.includes(token), "Missing royal-blue gold token "+token);
 }
});
test("current dashboard has a useful welcome and no functionality was removed",()=>{
 assert.match(dashboard,/className="twSignatureWelcome"/);
 assert.match(dashboard,/className="twSignatureWelcomePills"/);
 assert.match(dashboard,/className="twSignatureWelcomeActions"/);
 assert.match(dashboard,/setTaskDialogOpen\(true\)/);
 assert.match(dashboard,/setTab\("kanban"\)/);
 for(const element of ["<WorkspaceDialog","<UserDialog","<TaskDialog","<DndContext",'className="stats statsSix"','className="sectionTabs"']){
   assert.ok(dashboard.includes(element),"Lost working dashboard element "+element);
 }
});
test("blue and gold extends to Kanban, dialogs, reports and mobile",()=>{
 for(const selector of [
  ".appShell .twSignatureWelcome",
  ".appShell .sidebar",
  ".appShell .stats.statsSix",
  ".appShell .kanbanColumn",
  ".appShell .kanbanCard",
  ".dialogPanel",
  ".dialogSidebar",
  ".dialogHeader",
  ".dialogClose",
  ".authV3FormCard",
  ".appShell .mobileTopbar"
 ]){
   assert.ok(polish.includes(selector),"Missing styled component "+selector);
 }
 assert.match(polish,/@media\(max-width:760px\)/);
 assert.match(polish,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(polish,/@media print/);
});
test("existing workspace, user and task modal components remain intact",()=>{
 assert.match(workspace,/<DialogShell/);
 assert.match(user,/<DialogShell/);
 assert.match(task,/<DialogShell/);
});
