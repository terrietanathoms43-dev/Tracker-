import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { organizationMembers, organizations, sessions, users } from "@/db/schema";
import { ORG_COOKIE } from "@/lib/constants";
import { orgCookieOptions } from "@/lib/org-cookie";
import { safePath } from "@/lib/safe-path";
import { isTestEmail, isTestPersona, OTHER_ORG, TEST_HOME, TEST_ORG, TEST_PERSONA_NAMES, TEST_PERSONAS, testModeEnabled } from "@/lib/test-mode";

const SESSION_HOURS = 12;

/** Auth.js v5's session cookie on http (the dev server; production is https and never has test mode on). */
const SESSION_COOKIE = "authjs.session-token";

const notFound = () => new NextResponse("Not found", { status: 404 });

function secretMatches(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(process.env.TEST_MODE_SECRET ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Dev-only sign-in for the seeded personas (rules in lib/test-mode.ts).
 *
 *   GET /api/test-login?as=<persona>&secret=<TEST_MODE_SECRET>[&to=/path]
 *
 * Auth uses database sessions, so "signing in" is a session row plus Auth.js's own cookie. The persona's
 * demo workspace also becomes the active workspace.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  // Looks like any other missing page unless test mode is on and the secret is right.
  if (!testModeEnabled() || !secretMatches(query.get("secret") ?? "")) return notFound();

  const as = query.get("as") ?? "";
  if (!isTestPersona(as)) {
    return NextResponse.json({ error: `as must be one of: ${TEST_PERSONA_NAMES.join(", ")}` }, { status: 400 });
  }
  const persona = TEST_PERSONAS[as];

  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, persona.email));
  if (!user) return NextResponse.json({ error: "Test accounts are not seeded. Run: npm run test:seed" }, { status: 404 });
  // Belt and braces: never hand out a session for anything but a test account.
  if (!isTestEmail(user.email)) return NextResponse.json({ error: "Not a test account" }, { status: 409 });

  const slug = persona.org === "demo" ? TEST_ORG.slug : OTHER_ORG.slug;
  const [membership] = await db
    .select({ orgId: organizations.id })
    .from(organizations)
    .innerJoin(organizationMembers, and(eq(organizationMembers.orgId, organizations.id), eq(organizationMembers.userId, user.id)))
    .where(eq(organizations.slug, slug));
  if (!membership) return NextResponse.json({ error: "Test account is out of shape. Run: npm run test:seed" }, { status: 409 });

  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires });

  // ?to=/settings lands on a specific page (same-site paths only).
  const destination = safePath(query.get("to") ?? "", TEST_HOME);
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(SESSION_COOKIE, sessionToken, { httpOnly: true, sameSite: "lax", path: "/", expires });
  response.cookies.set(ORG_COOKIE, membership.orgId, orgCookieOptions);
  return response;
}
