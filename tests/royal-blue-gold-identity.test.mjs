import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const theme=css.slice(css.lastIndexOf("/* Restore the established royal-blue & gold Trackwise identity."));

test("simplified navigation retains Trackwise royal-blue and gold theme",()=>{
 assert.ok(theme.length>3500,"Brand theme override must exist");
 assert.match(theme,/#102a63/i);
 assert.match(theme,/#234a9e/i);
 assert.match(theme,/#f2c56f/i);
 assert.match(theme,/\.twDashboardActionStrip\{[\s\S]*?background:linear-gradient\([^;]*#fff4d6/);
 assert.match(theme,/\.twDashboardActionButtons button\.primary\{/);
 assert.match(theme,/\.twDashboardMetric:nth-child\(1\)\{/);
 assert.match(theme,/\.twDashboardMetric:nth-child\(3\)\{/);
 assert.match(theme,/\.twDashboardBelow \.twDashboardShortcuts/);
 assert.match(theme,/\.sidebar \.navItem\.selected/);
});
test("blue-gold look does not displace functional simplified dashboard",()=>{
 for(const className of ["twDashboardHero","twDashboardActionStrip","twDashboardMetricGrid","twDashboardTaskPanel","twDashboardFilters","twDashboardAdvancedFilters","twDashboardBelow"]){
  assert.ok(page.includes('className="'+className+'"')||page.includes('className="card '+className+'"')||page.includes('className={"'+className+' "'),"Missing "+className);
 }
 assert.match(page,/TaskBoard hideStats/);
 assert.match(page,/className="sectionTabs"/);
 assert.doesNotMatch(page,/className="twDashboardToolbar"/);
 assert.doesNotMatch(page,/Budgets\s*&\s*Resources/);
});
