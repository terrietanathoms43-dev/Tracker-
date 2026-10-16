import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const dashboard=readFileSync(new URL("../app/components/dashboard.tsx",import.meta.url),"utf8");
const shell=readFileSync(new URL("../app/components/dialog-shell.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

test("project navigation remains quick and workspace administration stays in a dialog",()=>{
 for(const token of ['aria-label="Projects"','projectFilter === "all"','projectFilter === "none"','setMobileMenu(false)','<WorkspaceDialog','<UserDialog','className="sidebar"']){
  assert.ok(dashboard.includes(token)||token==='className="sidebar"'&&dashboard.includes('className={"sidebar '),"Missing "+token);
 }
 assert.ok(shell.includes('className="dialogSplit"'));
 assert.ok(shell.includes('className="dialogSidebar"'));
});
test("dashboard prioritizes task progress, Kanban, and simple sections",()=>{
 for(const key of ['"summary" as Tab','"kanban" as Tab','"reports" as Tab','"messages" as Tab','className="stats statsSix"','<DndContext','<TaskDialog']){
  assert.ok(dashboard.includes(key),"Missing dashboard control "+key);
 }
});
test("task search and status filtering remain available",()=>{
 for(const control of ["setStatusFilter","setSearch(","setMyTasksOnly","setProjectFilter"]){
  assert.ok(dashboard.includes(control),"Missing filter "+control);
 }
 assert.ok(styles.includes(".sectionTabs"));
});
test("quick navigation to reporting and team interactions remains",()=>{
 for(const part of ['<WorkspaceDialog','<UserDialog','<TaskDialog','openWorkspaceSection','tab === "reports"','tab === "messages"']){
  assert.ok(dashboard.includes(part),"Missing "+part);
 }
});
