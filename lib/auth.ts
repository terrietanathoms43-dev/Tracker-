import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { sendMail } from "@/lib/mail";
import { mailFrom, smtpConfig } from "@/lib/mail/config";
import { magicLinkEmail } from "@/lib/mail/templates";

/** Google sign-in needs an OAuth client; without one the button is not shown and the provider not registered. */
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const providers: NextAuthConfig["providers"] = [
  Nodemailer({
    server: smtpConfig,
    from: mailFrom,
    // Through lib/mail, so a .test address never reaches SMTP and dev links land in the console.
    async sendVerificationRequest({ identifier, url }) {
      await sendMail(magicLinkEmail({ to: identifier, url }));
    },
  }),
];
if (googleEnabled) {
  providers.unshift(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers,
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login",
  },
  callbacks: {
    // Database sessions hand us the whole users row; only these four fields may reach a page.
    session({ session, user }) {
      return {
        expires: session.expires,
        user: { id: user.id, name: user.name ?? null, email: user.email, image: user.image ?? null },
      };
    },
  },
});
