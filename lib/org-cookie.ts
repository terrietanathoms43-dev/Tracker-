import "server-only";
import { cookies } from "next/headers";
import { ORG_COOKIE } from "@/lib/constants";

export const orgCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
};

/** Server Actions and Route Handlers only: Server Components cannot write cookies. */
export async function setActiveOrgCookie(orgId: string): Promise<void> {
  (await cookies()).set(ORG_COOKIE, orgId, orgCookieOptions);
}

export async function readActiveOrgCookie(): Promise<string | undefined> {
  return (await cookies()).get(ORG_COOKIE)?.value;
}

/**
 * Best-effort rewrite of a stale cookie. It sticks when called from an action or route handler; during a
 * page render the write is refused, which is harmless because the fallback is recomputed on the next request.
 */
export async function tryRewriteActiveOrgCookie(orgId: string): Promise<void> {
  try {
    await setActiveOrgCookie(orgId);
  } catch {
    // Rendering a Server Component: cookies are read-only here.
  }
}
