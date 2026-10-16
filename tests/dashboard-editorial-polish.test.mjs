import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../app/components/dashboard.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/signature-finish.css", import.meta.url), "utf8");

test("workspace hero shows actual, bounded task completion rather than sample data", () => {
  assert.match(dashboard, /counts\.total > 0 \? Math\.round\(\(counts\.done \/ counts\.total\) \* 100\) : 0/);
  assert.match(dashboard, /className="twSignatureProgressDial"/);
  assert.match(dashboard, /completionPercent}% of tasks completed/);
  assert.match(css, /conic-gradient\(#d3a244/);
});

test("project cards expose accessible progress values based on saved completed tasks", () => {
  assert.match(dashboard, /function ProjectProgress/);
  assert.match(dashboard, /task\.status === "completed"/);
  assert.match(dashboard, /aria-valuemin=\{0\}/);
  assert.match(dashboard, /aria-valuemax=\{100\}/);
  assert.match(dashboard, /aria-valuenow=\{percent\}/);
  assert.match(dashboard, /tasks\.filter\(\(t\) => t\.project_id === p\.id\)/);
});

test("six metric icons and clear navigation are present while dialogs remain", () => {
  for (const icon of ["ListTodo", "UserRoundCheck", "Clock3", "CheckCircle2", "UserRoundX", "ClipboardCheck"]) {
    assert.ok(dashboard.includes("<" + icon + " size={20}"), icon + " missing from a metric");
  }
  for (const component of ["<TaskDialog", "<UserDialog", "<WorkspaceDialog", "<DndContext"]) {
    assert.ok(dashboard.includes(component), "Lost interactive component " + component);
  }
  assert.match(dashboard, /label: "Overview"/);
  assert.match(dashboard, /label: "Team messages"/);
});

test("refinement has mobile, keyboard and reduced motion coverage", () => {
  assert.match(css, /\.twSignatureMomentum/);
  assert.match(css, /\.twProjectProgressTrack/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:410px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
