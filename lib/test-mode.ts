import type { OrgRole } from "@/lib/constants";

/**
 * TEST MODE: lets an AI assistant (or a developer) sign in as one of the seeded personas without Google
 * or a magic link, so every screen can be checked end to end in a real browser.
 *
 * It only works when ALL of these hold:
 *   1. this is not a production build (`next start` / pm2 always run as production)
 *   2. TEST_MODE_SECRET is set in .env.local (16+ characters) and the request carries the same value
 *   3. the account is one of the seeded personas below; a real user can never be signed in this way
 *
 * set up:   npm run test:seed        (creates / resets the personas and the demo workspaces)
 * sign in:  /api/test-login?as=<persona>&secret=<TEST_MODE_SECRET>&to=/home
 * remove:   npm run test:clean       (deletes the demo workspaces and every .test account)
 *
 * Isolation: no email is ever sent to a .test address (lib/mail), and the scripts only ever touch
 * workspaces whose every member is a .test account.
 */

export const TEST_EMAIL_DOMAIN = "@trackwise.test";

export const TEST_ORG = { name: "Trackwise Demo", slug: "trackwise-demo", timezone: "America/Jamaica" } as const;

/** A second workspace with its own .test members, so cross-workspace isolation can be proven. */
export const OTHER_ORG = { name: "Other Co", slug: "other-co", timezone: "America/New_York" } as const;

type Persona = {
  email: string;
  name: string;
  org: "demo" | "other";
  role: OrgRole;
};

export const TEST_PERSONAS = {
  admin: { email: `avery${TEST_EMAIL_DOMAIN}`, name: "Avery Admin", org: "demo", role: "admin" },
  leader: { email: `morgan${TEST_EMAIL_DOMAIN}`, name: "Morgan Lead", org: "demo", role: "leader" },
  member: { email: `jordan${TEST_EMAIL_DOMAIN}`, name: "Jordan Dev", org: "demo", role: "member" },
  member2: { email: `sam${TEST_EMAIL_DOMAIN}`, name: "Sam Dev", org: "demo", role: "member" },
  stakeholder: { email: `taylor${TEST_EMAIL_DOMAIN}`, name: "Taylor Ops", org: "demo", role: "stakeholder" },
  other: { email: `riley${TEST_EMAIL_DOMAIN}`, name: "Riley Other", org: "other", role: "admin" },
} as const satisfies Record<string, Persona>;

export type TestPersona = keyof typeof TEST_PERSONAS;

export const TEST_PERSONA_NAMES = Object.keys(TEST_PERSONAS) as TestPersona[];

/** Where a persona lands after signing in when no `to` is given. */
export const TEST_HOME = "/home";

export function isTestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(TEST_EMAIL_DOMAIN);
}

export function isTestPersona(value: string): value is TestPersona {
  return Object.hasOwn(TEST_PERSONAS, value);
}

export function testModeEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && (process.env.TEST_MODE_SECRET ?? "").length >= 16;
}
