import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { organizationMembers, organizations, sessions, users } from "@/db/schema";
import { ORG_COOKIE } from "@/lib/constants";
import { orgCookieOptions } from "@/lib/org-cookie";
import { safePath } from "@/lib/safe-path";
import { isTestEmail, isTestPersona, OTHER_ORG, TEST_HOME, TEST_ORG, TEST_PERSONA_NAMES, TEST_PERSONAS, testModeEnabled } from "@/lib/test-mode";

const SESSION_HOURS = 12;

/** Better Auth's session cookie on http (the dev server; production is https, with the __Secure- prefix, and never has test mode on). */
const SESSION_COOKIE = "better-auth.session_token";

const notFound = () => new NextResponse("Not found", { status: 404 });

function secretMatches(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(process.env.TEST_MODE_SECRET ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The cookie value Better Auth expects: the token, a dot, and a base64 HMAC-SHA256 of the token under the auth secret. */
function signedSessionCookie(token: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${token}.${signature}`;
}

/**
 * Dev-only sign-in for the seeded personas (rules in lib/test-mode.ts).
 *
 *   GET /api/test-login?as=<persona>&secret=<TEST_MODE_SECRET>[&to=/path]
 *
 * Sessions live in the database, so "signing in" is a session row plus the signed cookie Better Auth reads.
 * The persona's demo workspace also becomes the active workspace.
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

  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  await db.insert(sessions).values({ token, userId: user.id, expiresAt, ipAddress: "", userAgent: "test-login", createdAt: now, updatedAt: now });

  // ?to=/settings lands on a specific page (same-site paths only).
  const destination = safePath(query.get("to") ?? "", TEST_HOME);
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(SESSION_COOKIE, signedSessionCookie(token), { httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt });
  response.cookies.set(ORG_COOKIE, membership.orgId, orgCookieOptions);
  return response;
}
