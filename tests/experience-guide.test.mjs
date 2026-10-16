import test from "node:test";
import assert from "node:assert/strict";
import {featureGuide,stepsForRole,visibleFeatures,progressLabel} from "../lib/experience-guide.ts";

const VALID_VIEWS=new Set([
 "overview","tasks","calendar","projects","planning","people","teams","notifications",
 "collaboration","requests","reports","resources","meeting_ai","activity","settings"
]);
const VALID_ACTIONS=new Set(["navigate","task","project","team","invite","request"]);

test("a complete guided onboarding exists for leaders and members",()=>{
 const leader=stepsForRole("leader"),member=stepsForRole("member"),starter=stepsForRole("new");
 assert.ok(leader.length>=10,"Leader guide should cover the main features.");
 assert.ok(member.length>=6,"Member guide should explain their own work.");
 assert.ok(starter.length>=4,"First-time users should learn to create or join.");
 for(const steps of [leader,member,starter]){
  assert.equal(steps[0].id,"welcome");
  assert.equal(steps.at(-1)?.id,"finish");
  assert.equal(new Set(steps.map(s=>s.id)).size,steps.length,"No repeated step ids.");
  for(const step of steps){
   assert.equal(step.points.length,3);
   assert.ok(step.summary.length>35);
   assert.ok(VALID_VIEWS.has(step.view),step.view);
   assert.ok(VALID_ACTIONS.has(step.action),step.action);
   assert.ok(step.cta.length>2);
  }
 }
});
test("the feature guide covers actual app destinations and explains their value",()=>{
 assert.ok(featureGuide.length>=15);
 assert.equal(new Set(featureGuide.map(f=>f.id)).size,featureGuide.length);
 for(const item of featureGuide){
  assert.ok(VALID_VIEWS.has(item.view),item.name);
  assert.ok(item.purpose.length>=20,item.name+" needs a clear purpose.");
  assert.ok(item.how.length>=20,item.name+" needs useful instructions.");
 }
});
test("members do not receive leader-only feature instructions",()=>{
 const leader=visibleFeatures("leader"),member=visibleFeatures("member");
 assert.ok(leader.length>member.length);
 assert.ok(leader.some(f=>f.id==="meeting"));
 assert.ok(leader.some(f=>f.id==="backup"));
 assert.ok(!member.some(f=>f.leaderOnly));
 assert.ok(member.some(f=>f.id==="files"));
});
test("step progress is always a human-readable, bounded label",()=>{
 assert.equal(progressLabel(0,10),"Step 1 of 10");
 assert.equal(progressLabel(9,10),"Step 10 of 10");
 assert.equal(progressLabel(99,10),"Step 10 of 10");
});
