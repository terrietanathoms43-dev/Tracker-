import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const layout=readFileSync(new URL("../app/layout.tsx",import.meta.url),"utf8");
const theme=readFileSync(new URL("../app/brand-system.css",import.meta.url),"utf8");
const globals=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const auth=readFileSync(new URL("../app/auth-experience.tsx",import.meta.url),"utf8");
const board=readFileSync(new URL("../app/components/dashboard.tsx",import.meta.url),"utf8");
const reports=readFileSync(new URL("../app/reports.tsx",import.meta.url),"utf8");

test("global theme loads after base styles so consistent brand rules win",()=>{
 const base=layout.indexOf('import "./globals.css"');
 const brand=layout.indexOf('import "./brand-system.css"');
 assert.ok(base>=0,"Missing base stylesheet");
 assert.ok(brand>base,"Theme must be imported after base stylesheet");
});
test("royal blue and warm gold remain single-source brand variables",()=>{
 for(const color of ["#102a63","#234a9e","#346bd5","#f2c56f"]){
  assert.ok(globals.includes(color),"Missing official brand color "+color);
 }
 for(const token of [
  "--trackwise-brand-navy","--trackwise-brand-royal",
  "--trackwise-brand-blue","--trackwise-brand-gold"
 ])assert.ok(theme.includes("var("+token),"Brand variable unused: "+token);
});
test("all primary screens have explicit blue-and-gold theme treatment",()=>{
 for(const selector of [
  ".authV3Story",".authV3FormCard",".authV3MobileBrand",
  ".appShell .sidebar",".appShell .mobileTopbar",
  ".appShell .mobileBottomNav",".appShell .appHeader",
  ".appShell .sectionTabs button.active",".appShell .twBoardLaneHead",
  ".appShell .projectCard",".appShell .reportHero",
  ".quickCreateTop"
 ])assert.ok(theme.includes(selector),"Missing styled surface "+selector);
 for(const component of [auth,page,board,reports]){
  assert.ok(component.includes("className="),"App page lost its UI component");
 }
});
test("branding includes mobile sign-in with visible gold and blue navigation",()=>{
 assert.match(theme,/@media\(max-width:760px\)/);
 assert.match(theme,/\.authV3MobileBrand\s*\{[\s\S]*?border-bottom:\s*4px solid var\(--tw-brand-gold\)/);
 assert.match(theme,/\.appShell \.mobileTopbar\s*\{[\s\S]*?border-bottom:\s*3px solid var\(--tw-brand-gold\)/);
 assert.match(theme,/\.appShell \.mobileBottomNav\s*\{[\s\S]*?border-top:\s*3px solid var\(--tw-brand-gold\)/);
});
test("responsive theme preserves keyboard focus and print-ready reports",()=>{
 assert.match(theme,/button:focus-visible/);
 assert.match(theme,/outline:\s*3px solid #d29b37/);
 assert.match(theme,/@media print/);
 assert.match(theme,/\.appShell \.reportHero/);
 assert.ok(page.includes("<Dashboard"));
 assert.ok(board.includes("<DndContext"));
 assert.ok(board.includes("<WorkspaceDialog"));
});
