"use server";

import { APIError } from "better-auth/api";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAllowedEmail } from "@/lib/allowed-domains";
import { auth } from "@/lib/auth";
import { ORG_COOKIE } from "@/lib/constants";
import { safePath } from "@/lib/safe-path";

// Sign-in is the one place that uses plain <form action> server actions: Better Auth redirects or sends an
// email, so there is no ActionResult to show; errors come back as ?error= codes that the login page turns
// into sentences.

function loginError(code: string, redirectTo: string): never {
  const params = new URLSearchParams({ error: code });
  if (redirectTo !== "/home") params.set("callbackUrl", redirectTo);
  redirect(`/login?${params}`);
}

const emailSchema = z.email().max(254);

export async function signInWithEmail(form: FormData): Promise<void> {
  const redirectTo = safePath(form.get("redirectTo"));
  const email = emailSchema.safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) loginError("EmailInvalid", redirectTo);
  // Checked here for a friendly message; lib/auth.ts enforces the same rule at the API.
  if (!isAllowedEmail(email.data)) loginError("domain", redirectTo);
  try {
    await auth.api.signInMagicLink({
      body: { email: email.data, callbackURL: redirectTo, errorCallbackURL: "/login?error=magic_link" },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) loginError("EmailSignInError", redirectTo);
    throw error;
  }
  redirect("/login/check-email");
}

export async function signInWithGoogle(form: FormData): Promise<void> {
  const redirectTo = safePath(form.get("redirectTo"));
  let url: string | undefined;
  try {
    const result = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: redirectTo, errorCallbackURL: "/login?error=google", disableRedirect: true },
      headers: await headers(),
    });
    url = result.url;
  } catch (error) {
    if (error instanceof APIError) loginError("google", redirectTo);
    throw error;
  }
  if (!url) loginError("google", redirectTo);
  redirect(url);
}

export async function signOutAction(): Promise<void> {
  // The active-workspace cookie names a workspace; on a shared machine it should not outlive the session.
  (await cookies()).delete(ORG_COOKIE);
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
