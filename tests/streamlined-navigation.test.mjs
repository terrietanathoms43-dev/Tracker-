import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

test("primary sidebar has one navigation level and contextual section tabs remain",()=>{
 assert.match(page,/className="navCluster"/);
 assert.doesNotMatch(page,/className="navSubLinks"/);
 assert.match(page,/className="sectionTabs"/);
 assert.match(page,/className="sidebarWorkspaceInfo"/);
 assert.match(page,/className="sidebarGuideButton"/);
 for(const area of ["overview","tasks","projects","people","notifications","reports","settings"]){
  assert.match(page,new RegExp('defaultView:"'+area+'"'));
 }
});
test("dashboard focuses on one short row of meaningful actions and four metrics",()=>{
 assert.match(page,/className="twDashboardActionStrip"/);
 assert.match(page,/className="twDashboardActionButtons"/);
 assert.doesNotMatch(page,/className="twDashboardToolbar"/);
 const metrics=page.slice(page.indexOf("const dashboardStats=["),page.indexOf("const dashboardFilterCount="));
 assert.match(metrics,/Total tasks/);
 assert.match(metrics,/In progress/);
 assert.match(metrics,/Overdue/);
 assert.match(metrics,/For review/);
 assert.match(metrics,/Completed/);
 assert.equal((metrics.match(/\{label:/g)||[]).length,4);
 assert.match(page,/className="twDashboardHero"/);
});
test("filter controls remain accessible and can be cleared",()=>{
 assert.match(page,/aria-expanded=\{showDashboardFilters\}/);
 assert.match(page,/id="twDashboardAdvancedFilters"/);
 assert.match(page,/hidden=\{!showDashboardFilters\}/);
 assert.match(page,/function clearDashboardFilters\(/);
 assert.match(styles,/\.twDashboardAdvancedFilters\[hidden\]\{display:none!important\}/);
});
test("all existing task board and reports entry points remain",()=>{
 assert.match(page,/TaskBoard hideStats/);
 assert.match(page,/navigate\("reports"\)/);
 assert.match(page,/navigate\("calendar"\)/);
 assert.match(page,/navigate\("collaboration"\)/);
 assert.match(page,/className="mobileBottomNav"/);
});
