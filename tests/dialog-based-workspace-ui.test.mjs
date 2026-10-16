import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const layout=readFileSync(new URL("../app/layout.tsx",import.meta.url),"utf8");
const brand=readFileSync(new URL("../app/brand-system.css",import.meta.url),"utf8");
const dialogs=readFileSync(new URL("../app/workspace-dialog.css",import.meta.url),"utf8");

test("royal blue and gold are applied across the app through imported stylesheets",()=>{
 assert.match(layout,/import "\.\/globals\.css"/);
 assert.match(layout,/import "\.\/brand-system\.css"/);
 assert.match(layout,/import "\.\/workspace-dialog\.css"/);
 for(const token of ["--trackwise-brand-navy","--trackwise-brand-royal","--trackwise-brand-gold"]){
  assert.ok(brand.includes(token));
 }
 for(const area of ["authV3Story","authV3Right","authV3FormCard","sidebar","appHeader","mobileTopbar","mobileBottomNav","twBoardLane","reportHero","quickCreateTop"]){
  assert.ok(brand.includes("."+area),"Missing themed "+area);
 }
});
test("workspace sections use a single modal dialog with internal navigation and close button",()=>{
 assert.match(page,/const DIALOG_VIEWS=new Set<View>/);
 assert.match(page,/className="twWorkspaceDialogNav"/);
 assert.match(page,/className="twWorkspaceDialogBody"/);
 assert.match(page,/className="twWorkspaceDialogTitleBar"/);
 assert.match(page,/role=\{dialogView\?"dialog":undefined\}/);
 assert.match(page,/aria-modal=\{dialogView\?true:undefined\}/);
 assert.match(page,/ref=\{dialogCloseRef\}/);
 assert.match(page,/function closeWorkspaceDialog\(\)/);
 assert.match(page,/event\.key==="Escape"/);
 assert.match(dialogs,/\.twWorkspaceDialog\{/);
 assert.match(dialogs,/\.twWorkspaceDialogNavGroup button\.selected/);
 assert.match(dialogs,/@media\(max-width:600px\)/);
});
test("core task/project and quick-create workflows remain reachable",()=>{
 assert.match(page,/className="twSideProjectList"/);
 assert.match(page,/navigate\("tasks"\)/);
 assert.match(page,/navigate\("projects"\)/);
 assert.match(page,/className="twWorkspacePickerDialog"/);
 assert.match(page,/<QuickCreate key=\{quickCreate/);
 assert.match(page,/<WorkspaceInfo name=\{active\.name\}/);
 assert.match(page,/TaskBoard hideStats/);
});
