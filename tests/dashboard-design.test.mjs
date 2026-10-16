import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const dashboard=readFileSync(new URL("../app/components/dashboard.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
const brand=readFileSync(new URL("../app/brand-system.css",import.meta.url),"utf8");
const operations=readFileSync(new URL("../app/operations.tsx",import.meta.url),"utf8");

test("new dashboard retains clear progress, Kanban, reports and quick actions",()=>{
 assert.ok(page.includes('import Dashboard from "./components/dashboard"'));
 assert.ok(page.includes("<Dashboard"));
 for(const value of ['className="sectionTabs"','className="stats statsSix"','tab === "kanban"','tab === "reports"','tab === "messages"','<DndContext','<WorkspaceDialog','<UserDialog','<TaskDialog']){
  assert.ok(dashboard.includes(value),"Missing dashboard feature "+value);
 }
 assert.ok(styles.includes(".twDashboardHero{")||brand.includes(".appShell .appHeader"),"Missing branded heading");
});
test("Budgets and Resources no longer appear as an application section",()=>{
 assert.doesNotMatch(page,/Budgets\s*&\s*Resources|view==="resources"|view:"resources"/i);
 assert.doesNotMatch(operations,/tw_budget_items|Budget register|section==="resources"/i);
 assert.match(operations,/section==="collaboration"/);
 assert.match(operations,/section==="notifications"/);
});
