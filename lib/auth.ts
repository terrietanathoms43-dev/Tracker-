import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";
import { allowedDomainsLabel, isAllowedEmail } from "@/lib/allowed-domains";
import { log } from "@/lib/log";
import { sendMail } from "@/lib/mail";
import { magicLinkEmail } from "@/lib/mail/templates";

// Better Auth: database sessions in our own tables, Google plus an email magic link, cookies set through
// next/headers so server actions can sign people in and out. Reads happen in lib/viewer.ts. The company
// email rule (ALLOWED_EMAIL_DOMAINS) is enforced here, at the API, so no sign-in path can skip it.

/** The message a blocked address gets, in the user's words. */
export function domainRuleMessage(): string {
  return `Only ${allowedDomainsLabel() ?? "approved"} email addresses can sign in.`;
}

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;

/** Google sign-in needs an OAuth client; without one the button is not shown and the provider not registered. */
export const googleEnabled = Boolean(googleClientId && googleClientSecret);

const DAY = 60 * 60 * 24;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  user: {
    // Our own column on the users table; set from Settings, never from a sign-up form.
    additionalFields: { timezone: { type: "string", required: false, input: false } },
  },
  session: { expiresIn: 30 * DAY, updateAge: DAY },
  socialProviders: googleEnabled ? { google: { clientId: googleClientId!, clientSecret: googleClientSecret! } } : {},
  plugins: [
    magicLink({
      expiresIn: 60 * 60,
      // Through lib/mail, so a .test address never reaches SMTP and dev links land in the console.
      async sendMagicLink({ email, url }) {
        await sendMail(magicLinkEmail({ to: email, url }));
      },
    }),
    nextCookies(),
  ],
  hooks: {
    // A magic link is only ever sent to an allowed address; outsiders get a clear refusal, not a dead email.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/magic-link") return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
      if (!isAllowedEmail(email)) throw new APIError("FORBIDDEN", { message: domainRuleMessage() });
    }),
  },
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          // Google sign-ups land here: the same rule, so an outside account never becomes a user.
          if (!isAllowedEmail(user.email)) {
            log.warn("auth.sign_up_refused", { domain: user.email.split("@")[1] ?? "" });
            return false;
          }
          // A magic-link sign-up carries no name; "jordan" from jordan@… beats an empty string in every list.
          const name = user.name?.trim() || user.email.split("@")[0];
          return { data: { ...user, name } };
        },
      },
    },
  },
});

export type Auth = typeof auth;
