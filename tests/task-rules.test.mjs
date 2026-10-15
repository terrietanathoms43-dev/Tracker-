import test from "node:test";
import assert from "node:assert/strict";
import {canManageOrganization,canEditTaskChecklist,canOwnTask,canSubmitForApproval,canCompleteTask,canChangeTaskStatus,allowedTaskStatuses,taskStatusLabel,userFacingError} from "../lib/task-rules.ts";

test("administrators and leaders can manage, others cannot",()=>{
 for(const role of ["admin","leader"])assert.equal(canManageOrganization(role),true);
 for(const role of ["member","observer","stakeholder",null,undefined])
  assert.equal(canManageOrganization(role),false);
});

test("only task owners with member privileges and leaders can edit checklists",()=>{
 assert.equal(canEditTaskChecklist("member","a","a"),true);
 assert.equal(canEditTaskChecklist("member","a","b"),false);
 assert.equal(canEditTaskChecklist("member",null,"a"),false);
 assert.equal(canEditTaskChecklist("observer","a","a"),false);
 assert.equal(canEditTaskChecklist("stakeholder","a","a"),false);
 assert.equal(canEditTaskChecklist("admin",null,"a"),true);
 assert.equal(canEditTaskChecklist("leader","a","b"),true);
});

test("only assigned members with unfinished work can submit for review",()=>{
 assert.equal(canSubmitForApproval("member","a","a","underway"),true);
 assert.equal(canSubmitForApproval("member","a","a","not_started"),true);
 assert.equal(canSubmitForApproval("member","a","a","blocked"),true);
 assert.equal(canSubmitForApproval("member","a","a","completed"),false);
 assert.equal(canSubmitForApproval("member","a","a","awaiting_approval"),false);
 assert.equal(canSubmitForApproval("member","a","b","underway"),false);
 assert.equal(canSubmitForApproval("observer","a","a","underway"),false);
});

test("task completion requires a leader or administrator",()=>{
 assert.equal(canCompleteTask("admin"),true);
 assert.equal(canCompleteTask("leader"),true);
 assert.equal(canCompleteTask("member"),false);
 assert.equal(canCompleteTask(undefined),false);
});

test("task workflow uses friendly labels",()=>{
 const labels={not_started:"To do",underway:"In progress",awaiting_approval:"For review",blocked:"Blocked",rejected:"Needs changes",completed:"Completed"};
 for(const [status,label] of Object.entries(labels))assert.equal(taskStatusLabel(status),label);
 assert.equal(taskStatusLabel("custom_stage"),"Custom Stage");
});

test("errors explain missing connectivity and expired sessions",()=>{
 assert.match(userFacingError(new Error("Failed to fetch"),"Save failed"),/internet/i);
 assert.match(userFacingError({message:"JWT expired"},"Save failed"),/session/i);
 assert.match(userFacingError({message:"duplicate key value violates constraint"},"Save failed"),/already exists/i);
 assert.equal(userFacingError(null,"Save failed"),"Save failed");
 assert.equal(userFacingError(new Error("Only administrators can approve"),"Save failed"),"Only administrators can approve");
});

test("task owner role eligibility blocks read-only roles",()=>{
 for(const role of ["admin","leader","member"])assert.equal(canOwnTask(role),true);
 for(const role of ["observer","stakeholder",null,undefined,"unknown"])assert.equal(canOwnTask(role),false);
});

test("task board and list use the same permission rules",()=>{
 for(const role of ["admin","leader"]){
  assert.equal(canChangeTaskStatus(role,null,"manager","awaiting_approval"),true);
  assert.equal(allowedTaskStatuses(role,"awaiting_approval").includes("rejected"),true);
  assert.equal(allowedTaskStatuses(role,"underway").includes("rejected"),false);
  assert.equal(allowedTaskStatuses(role,"underway").includes("completed"),true);
 }
 assert.equal(canChangeTaskStatus("member","a","a","underway"),true);
 assert.equal(canChangeTaskStatus("member","a","a","awaiting_approval"),false);
 assert.equal(canChangeTaskStatus("member","a","a","completed"),false);
 assert.equal(canChangeTaskStatus("member","a","b","underway"),false);
 assert.equal(canChangeTaskStatus("observer","a","a","underway"),false);
 assert.equal(canChangeTaskStatus("stakeholder","a","a","underway"),false);
 assert.deepEqual(allowedTaskStatuses("member","awaiting_approval"),["awaiting_approval"]);
 assert.deepEqual(allowedTaskStatuses("member","completed"),["completed"]);
 assert.deepEqual(allowedTaskStatuses("observer","underway"),["underway"]);
 assert.ok(allowedTaskStatuses("member","underway").includes("awaiting_approval"));
 assert.ok(!allowedTaskStatuses("member","underway").includes("completed"));
 assert.ok(!allowedTaskStatuses("member","underway").includes("rejected"));
});
