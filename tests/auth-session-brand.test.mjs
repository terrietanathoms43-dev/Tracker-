import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {initialAuthErrorMessage,isMissingAuthSessionError} from "../lib/auth-session.ts";

const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const auth=readFileSync(new URL("../app/auth-experience.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
const contract=readFileSync(new URL("../docs/BRAND_GUIDELINES.md",import.meta.url),"utf8");

test("an ordinary signed-out browser does not display a session-missing error",()=>{
 assert.equal(isMissingAuthSessionError({name:"AuthSessionMissingError",message:"Auth session missing!"}),true);
 assert.equal(isMissingAuthSessionError({message:"Auth session missing"}),true);
 assert.equal(isMissingAuthSessionError({code:"session_not_found"}),true);
 assert.equal(initialAuthErrorMessage({name:"AuthSessionMissingError",message:"Auth session missing!"}),null);
 assert.equal(initialAuthErrorMessage(null),null);
});
test("real login or refresh errors remain useful without leaking internal details",()=>{
 assert.equal(isMissingAuthSessionError({message:"Invalid login credentials"}),false);
 assert.match(initialAuthErrorMessage({message:"JWT expired"}),/session|sign in/i);
 assert.match(initialAuthErrorMessage({message:"Failed to fetch"}),/internet connection/i);
 assert.match(initialAuthErrorMessage({message:"Unrecognized internal error"}),/sign in again/i);
});
test("new dashboard architecture still follows auth events and displays signed-out sign-in page",()=>{
 for(const item of ["initialAuthErrorMessage(error)","authChangedSinceInitialCheck","SIGNED_IN","SIGNED_OUT","setUser(data.user)","className=\"authV3 authV3Loading\"","if (!user) return <AuthExperience","<Dashboard"]){
  assert.ok(page.includes(item),"Missing signed-out session behaviour "+item);
 }
 assert.ok(page.includes('if (message && !authChangedSinceInitialCheck) setError(message)'));
 assert.ok(page.includes('if (!authChangedSinceInitialCheck) setUser(data.user)'));
});
test("royal blue and gold appear from first login through mobile and desktop",()=>{
 for(const token of ["--trackwise-brand-navy:#102a63","--trackwise-brand-royal:#234a9e","--trackwise-brand-blue:#346bd5","--trackwise-brand-gold:#f2c56f"]){
  assert.ok(css.includes(token),"Missing brand token "+token);
 }
 for(const className of ["authV3Story","authV3Right","authV3FormCard","authV3Submit","authV3MobileBrand","authV3Loading"]){
  assert.ok(css.includes("."+className),"Missing branded style "+className);
 }
 for(const label of ["Create your account","Reset your password","Sign in to Trackwise"]){
  assert.ok(auth.includes(label),"Authentication step is missing "+label);
 }
 assert.match(contract,/Non-negotiable brand identity/i);
 assert.match(contract,/sign-in page/i);
});
