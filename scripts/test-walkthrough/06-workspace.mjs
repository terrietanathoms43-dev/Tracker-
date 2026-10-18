// Workspace administration (docs/PLAN.md §2–§3, apex-ux flow F): an admin invites someone and copies the link;
// the invitation page in every state (signed out, wrong account, invalid, used, expired); a reload offers a new
// link; revoking kills the old one; roles change and change back; the sole admin's own role is locked; a member
// and a leader see only what their role allows; Riley accepts an invitation into Trackwise Demo and is removed.
//
// Usage: node scripts/test-walkthrough/06-workspace.mjs [--base=http://localhost:3021]
import { closePool, finish, openBrowser, query, step, stoppedOn, tidy } from "./lib.mjs";

const INVITEE = "sam2@trackwise.test";
const EXPIRED = "expired@trackwise.test";
const browsers = {};

/** Replaces the clipboard so "Copy link" hands the link to the script instead of the OS. */
const stubClipboard = `(() => { window.__copied = null; navigator.clipboard.writeText = async (t) => { window.__copied = t }; return true })()`;

/** Sends one invitation from Settings → Workspace and returns the token from the copied link. */
async function invite(admin, email, role) {
  await admin.goto("/settings/workspace", 5000);
  await admin.waitFor("Send invitations");
  await admin.type("name@company.com", email);
  await admin.select("#invite-role", role);
  await admin.click("Send invitations", { wait: 2500 });
  await admin.waitForNear(email, "Copy link");
  await admin.evaluate(stubClipboard);
  await admin.click("Copy link", { near: email, exact: true, wait: 1200 });
  const link = String(await admin.evaluate("window.__copied"));
  return link.split("/invite/")[1] ?? "";
}

try {
  const admin = (browsers.admin = await openBrowser({ role: "admin", width: 1280, height: 900 }));
  const visitor = (browsers.visitor = await openBrowser({ role: "public", width: 390, height: 844 }));
  const member = (browsers.member = await openBrowser({ role: "member", width: 390, height: 844 }));

  // --- invite, copy the link, see the invitation page in its states ---------------------------------------------
  const token = await invite(admin, INVITEE, "admin");
  step("the admin invited someone and copied a real link", token.length > 20);
  step("the invitation is listed with its role", await admin.waitForNear(INVITEE, "Admin"));
  await admin.shot("06-admin-invited");

  await visitor.goto(`/invite/${token}`, 6000);
  step("signed out: You're invited, with Sign in to accept", (await visitor.waitFor("You're invited")) && (await visitor.has("Sign in to accept")));
  await visitor.shot("06-invite-signed-out");
  await member.goto(`/invite/${token}`, 6000);
  step("wrong account: a clear notice and a way to switch", (await member.waitFor("This invitation is for someone else")) && (await member.has("Sign out and switch account")));
  await visitor.goto("/invite/not-a-real-token-at-all-1234567890", 4000);
  step("an invalid link has its own page", await visitor.waitFor("This link isn't valid"));

  await admin.goto("/settings/workspace", 6000);
  step("after a reload the row offers a new link (only the hash is stored)", await admin.waitForNear(INVITEE, "Copy new link"));
  await admin.click(`Revoke invitation for ${INVITEE.split("@")[0]}`, { wait: 1200 });
  await admin.waitFor(`Revoke the invitation to ${INVITEE}?`);
  await admin.click("Revoke invitation", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("revoking shows the toast", await admin.waitFor(`Invitation to ${INVITEE} revoked.`));
  await visitor.goto(`/invite/${token}`, 4000);
  step("a revoked link is invalid", await visitor.waitFor("This link isn't valid"));

  // --- expired ---------------------------------------------------------------------------------------------------
  const expiredToken = await invite(admin, EXPIRED, "stakeholder");
  await query("update invitations set expires_at = now() - interval '1 day' where email = $1 and accepted_at is null", [EXPIRED]);
  await visitor.goto(`/invite/${expiredToken}`, 4000);
  step("an expired link has its own page", await visitor.waitFor("This invitation has expired"));
  await admin.goto("/settings/workspace", 5000);
  step("the settings row says Expired", await admin.waitForNear(EXPIRED, "Expired"));
  await admin.click(`Revoke invitation for ${EXPIRED.split("@")[0]}`, { wait: 1200 });
  await admin.click("Revoke invitation", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("the expired invitation can be revoked", await admin.waitFor(`Invitation to ${EXPIRED} revoked.`));

  // --- accept: Riley joins Trackwise Demo, then is removed ---------------------------------------------------------
  const rileyToken = await invite(admin, "riley@trackwise.test", "member");
  const riley = (browsers.riley = await openBrowser({ role: "other", width: 1280, height: 900 }));
  await riley.goto(`/invite/${rileyToken}`, 6000);
  step("a matching account sees Join", await riley.waitFor("Join Trackwise Demo"));
  await riley.click("Accept invitation", { wait: 4000 });
  step("accepting lands on home in the new workspace", (await riley.waitForPath("/home", 20_000)) && (await riley.waitFor("Trackwise Demo")));
  await riley.goto(`/invite/${rileyToken}`, 4000);
  step("the link then says already used", await riley.waitFor("Invitation already used"));
  await admin.goto("/settings/workspace", 5000);
  await admin.click("Remove Riley Other", { wait: 1000 });
  step("removing names the person", await admin.waitFor("Remove Riley Other from Trackwise Demo?"));
  await admin.click("Remove member", { exact: true, within: "[role=dialog]", wait: 2500 });
  step("Riley is removed", await admin.waitFor("Member removed."));

  // --- roles --------------------------------------------------------------------------------------------------------
  await admin.goto("/settings/workspace", 5000);
  await admin.select("select[aria-label='Role for Sam Dev']", "leader", { wait: 2500 });
  step("changing a role shows the toast", await admin.waitFor("Role changed to leader."));
  await admin.goto("/settings/workspace", 5000);
  step("the change survives a reload", (await admin.evaluate(`document.querySelector("select[aria-label='Role for Sam Dev']")?.value`)) === "leader");
  await admin.select("select[aria-label='Role for Sam Dev']", "member", { wait: 2500 });
  step("and can be changed back", await admin.waitFor("Role changed to member."));
  step("the sole admin's own role is locked", (await admin.evaluate(`document.querySelector("select[aria-label='Role for Avery Admin']")?.disabled`)) === true);

  // --- what a member and a leader see ---------------------------------------------------------------------------------
  await member.goto("/settings/workspace", 6000);
  step("a member sees the members", await member.waitFor("Members (5)"));
  step("a member has no role selects, invite form or delete card", (await member.evaluate(`document.querySelectorAll("select[aria-label^='Role for']").length`)) === 0 && !(await member.has("Send invitations")) && !(await member.has("Delete workspace")));
  await member.shot("06-member-workspace");

  const leader = (browsers.leader = await openBrowser({ role: "leader", width: 1280, height: 900 }));
  await leader.goto("/settings/workspace", 6000);
  step("a leader can invite", await leader.waitFor("Send invitations"));
  const roles = await leader.evaluate(`[...document.querySelectorAll("#invite-role option")].map((o) => o.value).join(",")`);
  step("a leader cannot invite an admin", roles === "leader,member,stakeholder", roles);
  step("a leader has no role selects or delete card", (await leader.evaluate(`document.querySelectorAll("select[aria-label^='Role for']").length`)) === 0 && !(await leader.has("Delete workspace")));

  // --- notifications and profile -------------------------------------------------------------------------------------
  await member.goto("/notifications", 5000);
  step("notifications load", await member.waitFor("Notifications"));
  await member.goto("/settings", 5000);
  step("the profile form loads with the person's name", (await member.waitFor("Profile")) && (await member.evaluate(`document.querySelector("#profile-name")?.value`)) === "Jordan Dev");
} catch (error) {
  await stoppedOn(error, "06", browsers);
  step("flow ran to the end", false);
} finally {
  for (const browser of Object.values(browsers)) await browser.close();
  await closePool();
  tidy();
  finish();
}
