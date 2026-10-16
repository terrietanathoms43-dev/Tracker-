import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
const operations=readFileSync(new URL("../app/operations.tsx",import.meta.url),"utf8");

test("dashboard keeps the Trackwise branded hero and usable actions",()=>{
 assert.match(page,/className="twDashboardHero"/);
 assert.match(page,/Make progress\.<span>Stay in control\.<\/span>/);
 assert.match(page,/className="twDashboardMetricGrid"/);
 assert.match(page,/className="twDashboardTaskPanel"/);
 assert.match(page,/className="twDashboardToolbar"/);
 assert.match(styles,/\.twDashboardHero\{/);
 assert.match(styles,/@media\(max-width:760px\).*\.twDashboardHero/s);
});
test("Budgets and Resources no longer appear as an application section",()=>{
 assert.doesNotMatch(page,/Budgets\s*&\s*Resources|view==="resources"|view:"resources"/i);
 assert.doesNotMatch(operations,/tw_budget_items|Budget register|section==="resources"/i);
 assert.match(operations,/section==="collaboration"/);
 assert.match(operations,/section==="notifications"/);
});
