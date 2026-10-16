import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const details=readFileSync(new URL("../app/task-extras.tsx",import.meta.url),"utf8");
const report=readFileSync(new URL("../app/report-export.tsx",import.meta.url),"utf8");

test("task detail refresh ignores stale responses and invalidates on selection change",()=>{
 assert.match(details,/const refreshSequence=useRef\(0\)/);
 assert.match(details,/const requestSequence=\+\+refreshSequence\.current/);
 assert.match(details,/if\(requestSequence!==refreshSequence\.current\)return/);
 assert.match(details,/if\(requestSequence===refreshSequence\.current\)setError/);
 assert.match(details,/if\(requestSequence===refreshSequence\.current\)setLoading\(false\)/);
 assert.match(details,/return\(\)=>\{refreshSequence\.current\+\+;/);
 assert.match(details,/setComments\(\[\]\);setChecklist\(\[\]\);setFiles\(\[\]\)/);
});

test("print report includes all scoped tasks without silent truncation",()=>{
 assert.match(report,/const attentionRows=attention\.map\(/);
 assert.match(report,/const allRows=scoped\.map\(/);
 assert.doesNotMatch(report,/attention\.slice\(0,40\)/);
 assert.doesNotMatch(report,/scoped\.slice\(0,100\)/);
 assert.doesNotMatch(report,/\(first 40\)|\(first 100\)/);
 assert.match(report,/Detailed task register/);
});
