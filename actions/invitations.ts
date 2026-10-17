"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { invitations, organizationMembers, users } from "@/db/schema";
import { fail, GuardError, ok, runAction, type ActionResult } from "@/lib/action-result";
import { signOut } from "@/lib/auth";
import { ORG_COOKIE, ORG_ROLE_LABELS, ORG_ROLES, type OrgRole } from "@/lib/constants";
import { hashInviteToken, inviteExpiry, inviteUrl, newInviteToken } from "@/lib/invite-token";
import { errorFields, log } from "@/lib/log";
import { providerFor, sendMail } from "@/lib/mail";
import { invitationEmail } from "@/lib/mail/templates";
import { setActiveOrgCookie } from "@/lib/org-cookie";
import { canInvite, canManageInvitation, type Viewer } from "@/lib/permissions";
import { requireUser, requireViewerContext, type ViewerContext } from "@/lib/viewer";

// Invitations: create, resend, renew the link, revoke, accept. The link is the credential: only its sha256 is
// stored, so every action that makes a link returns it to the person who asked (email may not be set up).
// Who may invite which role, and who may manage an invitation, are predicates in lib/permissions.ts.

const MAX_AT_ONCE = 20;

/** "a@x.com, b@y.com" or one per line → unique lowercased addresses. */
const emailList = z
  .string()
  .transform((raw) => [...new Set(raw.split(/[\s,;]+/).map((each) => each.trim().toLowerCase()).filter(Boolean))])
  .pipe(
    z
      .array(z.email({ error: (issue) => `“${String(issue.input)}” isn't an email address.` }))
      .min(1, "Enter at least one email address.")
      .max(MAX_AT_ONCE, `Invite up to ${MAX_AT_ONCE} people at a time.`),
  );

/** A link the inviter can copy, for when the email doesn't arrive (or SMTP isn't configured). */
export type InviteLink = { id: string; email: string; url: string };

export type InviteResult = { invited: InviteLink[]; alreadyMembers: string[]; failed: string[] };

/** Emails one invitation. Never throws: a failed email still leaves a working invitation and a link to copy. */
async function deliver(context: ViewerContext, link: InviteLink, role: OrgRole): Promise<boolean> {
  try {
    await sendMail(
      invitationEmail({
        to: link.email,
        url: link.url,
        orgName: context.org.name,
        inviterName: context.user.name ?? context.user.email,
        roleLabel: ORG_ROLE_LABELS[role].toLowerCase(),
      }),
    );
    return true;
  } catch (error) {
    log.error("invitations.send_failed", { orgId: context.viewer.orgId, ...errorFields(error) });
    return false;
  }
}

/** The toast. When nothing would deliver the email (production without SMTP), it says so instead of claiming it was sent. */
function sentMessage(emails: string[], verb: "sent" | "resent"): string | undefined {
  if (emails.length === 0) return undefined;
  if (emails.some((email) => providerFor(email) === null)) {
    return emails.length === 1 ? "Invitation ready. Copy the link and send it yourself." : `${emails.length} invitations ready. Copy each link and send it yourself.`;
  }
  return emails.length === 1 ? `Invitation ${verb} to ${emails[0]}.` : `${emails.length} invitations ${verb}.`;
}

const inviteSchema = z.object({ emails: emailList, role: z.enum(ORG_ROLES).default("member") });

/**
 * Invites a batch of addresses with one role. One open invitation per address: inviting someone again
 * refreshes it (new link, fresh 7 days), and the old link stops working. People already in the workspace
 * are skipped and reported back.
 */
export async function inviteMembers(input: z.input<typeof inviteSchema>): Promise<ActionResult<InviteResult>> {
  return runAction("invitations.create", inviteSchema, input, async ({ emails, role }) => {
    const context = await requireViewerContext();
    const { viewer } = context;
    if (!canInvite(viewer, role)) throw new GuardError("forbidden");

    const { links, alreadyMembers } = await db.transaction(async (tx) => {
      const members = await tx
        .select({ email: users.email })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(eq(organizationMembers.orgId, viewer.orgId));
      const memberEmails = new Set(members.map((row) => (row.email ?? "").toLowerCase()));

      const links: InviteLink[] = [];
      const alreadyMembers: string[] = [];
      for (const email of emails) {
        if (memberEmails.has(email)) {
          alreadyMembers.push(email);
          continue;
        }
        const { token, tokenHash } = newInviteToken();
        const values = { role, tokenHash, invitedBy: viewer.userId, expiresAt: inviteExpiry(), createdAt: new Date() };
        const [open] = await tx
          .select({ id: invitations.id, role: invitations.role })
          .from(invitations)
          .where(and(eq(invitations.orgId, viewer.orgId), eq(invitations.email, email), isNull(invitations.acceptedAt)))
          .for("update");
        // A leader must not quietly downgrade an admin invitation someone else sent.
        if (open && !canInvite(viewer, open.role)) throw new GuardError("forbidden", `${email} already has an invitation that only an admin can change.`);
        let id: string;
        if (open) {
          await tx.update(invitations).set(values).where(eq(invitations.id, open.id));
          id = open.id;
        } else {
          const [created] = await tx.insert(invitations).values({ orgId: viewer.orgId, email, ...values }).returning({ id: invitations.id });
          id = created.id;
        }
        links.push({ id, email, url: inviteUrl(token) });
      }
      return { links, alreadyMembers };
    });

    const failed: string[] = [];
    for (const link of links) if (!(await deliver(context, link, role))) failed.push(link.email);
    const sent = links.filter((link) => !failed.includes(link.email)).map((link) => link.email);

    log.info("invitations.created", { orgId: viewer.orgId, by: viewer.userId, role, count: links.length, failed: failed.length });
    refresh();
    return ok({ invited: links, alreadyMembers, failed }, sentMessage(sent, "sent"));
  });
}

const idSchema = z.object({ id: z.string().min(1).max(64) });

/** Gives an open invitation a new token and a fresh 7 days, after checking the viewer may manage it. */
async function renewToken(viewer: Viewer, id: string): Promise<{ link: InviteLink; role: OrgRole }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: invitations.id, email: invitations.email, role: invitations.role, invitedBy: invitations.invitedBy })
      .from(invitations)
      .where(and(eq(invitations.id, id), eq(invitations.orgId, viewer.orgId), isNull(invitations.acceptedAt)))
      .for("update");
    if (!row) throw new GuardError("not_found");
    if (!canManageInvitation(viewer, row.invitedBy)) throw new GuardError("forbidden");
    const { token, tokenHash } = newInviteToken();
    await tx.update(invitations).set({ tokenHash, expiresAt: inviteExpiry() }).where(eq(invitations.id, row.id));
    return { link: { id: row.id, email: row.email, url: inviteUrl(token) }, role: row.role };
  });
}

/** Emails the invitation again with a new link (the old one stops working) and returns the link too. */
export async function resendInvitation(input: z.input<typeof idSchema>): Promise<ActionResult<InviteLink>> {
  return runAction("invitations.resend", idSchema, input, async ({ id }) => {
    const context = await requireViewerContext();
    const { link, role } = await renewToken(context.viewer, id);
    const delivered = await deliver(context, link, role);
    log.info("invitations.resent", { orgId: context.viewer.orgId, invitationId: id, by: context.viewer.userId, delivered });
    refresh();
    if (!delivered) return fail(`The link was renewed, but the email to ${link.email} couldn't be sent. Copy the link instead.`);
    return ok(link, sentMessage([link.email], "resent"));
  });
}

/**
 * A fresh link to copy, without sending an email. Needed because the stored hash cannot be turned back into
 * the link once this browser has forgotten it; the old link (and any email carrying it) stops working.
 */
export async function renewInvitationLink(input: z.input<typeof idSchema>): Promise<ActionResult<InviteLink>> {
  return runAction("invitations.renew_link", idSchema, input, async ({ id }) => {
    const viewer = (await requireViewerContext()).viewer;
    const { link } = await renewToken(viewer, id);
    log.info("invitations.link_renewed", { orgId: viewer.orgId, invitationId: id, by: viewer.userId });
    refresh();
    return ok(link);
  });
}

export async function revokeInvitation(input: z.input<typeof idSchema>): Promise<ActionResult> {
  return runAction("invitations.revoke", idSchema, input, async ({ id }) => {
    const viewer = (await requireViewerContext()).viewer;
    const email = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: invitations.id, email: invitations.email, invitedBy: invitations.invitedBy })
        .from(invitations)
        .where(and(eq(invitations.id, id), eq(invitations.orgId, viewer.orgId), isNull(invitations.acceptedAt)))
        .for("update");
      if (!row) throw new GuardError("not_found");
      if (!canManageInvitation(viewer, row.invitedBy)) throw new GuardError("forbidden");
      await tx.delete(invitations).where(eq(invitations.id, row.id));
      return row.email;
    });
    log.info("invitations.revoked", { orgId: viewer.orgId, invitationId: id, by: viewer.userId });
    refresh();
    return ok(undefined, `Invitation to ${email} revoked.`);
  });
}

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,200}$/, "This invitation link isn't valid.");
const acceptSchema = z.object({ token: tokenSchema });

/**
 * Joins the invitation's workspace. The signed-in email must match the invited address (case-insensitively):
 * a link alone never grants access to a different account. The invitation is claimed in the same
 * transaction that adds the member, so a double submit cannot join twice.
 */
export async function acceptInvitation(input: z.input<typeof acceptSchema>): Promise<ActionResult> {
  const result = await runAction("invitations.accept", acceptSchema, input, async ({ token }) => {
    const user = await requireUser();
    const outcome = await db.transaction(async (tx): Promise<{ error: string } | { orgId: string }> => {
      const [invite] = await tx.select().from(invitations).where(eq(invitations.tokenHash, hashInviteToken(token))).for("update");
      if (!invite) return { error: "This invitation link isn't valid. Ask for a new one." };
      if (invite.acceptedAt !== null) return { error: "This invitation has already been used." };
      if (invite.expiresAt.getTime() <= Date.now()) return { error: "This invitation has expired. Ask whoever invited you to resend it." };
      if (invite.email !== user.email.toLowerCase()) return { error: "This invitation was sent to a different email address." };

      await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invite.id));
      // Someone who is already a member keeps the role they have.
      await tx
        .insert(organizationMembers)
        .values({ orgId: invite.orgId, userId: user.id, role: invite.role, invitedBy: invite.invitedBy })
        .onConflictDoNothing();
      return { orgId: invite.orgId };
    });
    if ("error" in outcome) return fail(outcome.error);
    await setActiveOrgCookie(outcome.orgId);
    log.info("invitations.accepted", { orgId: outcome.orgId, userId: user.id });
    return ok(undefined);
  });
  if (result.ok) redirect("/home");
  return result;
}

/**
 * "Sign out and switch account" on an invitation meant for another address. Like the sign-in actions in
 * actions/auth.ts this is a plain form action (Auth.js redirects, there is no result to show); it comes
 * back to the invitation after the next sign-in.
 */
export async function signOutToAcceptInvitation(form: FormData): Promise<void> {
  const token = tokenSchema.safeParse(form.get("token"));
  const callbackUrl = token.success ? `/invite/${token.data}` : "/home";
  (await cookies()).delete(ORG_COOKIE);
  await signOut({ redirectTo: `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` });
}
