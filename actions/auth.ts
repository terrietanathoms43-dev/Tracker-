"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { ORG_COOKIE } from "@/lib/constants";
import { safePath } from "@/lib/safe-path";

// Sign-in is the one place that uses plain <form action> server actions: Auth.js redirects, so there is no
// ActionResult to show; errors come back as ?error= codes that the login page turns into sentences.

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
  let next: string;
  try {
    next = await signIn("nodemailer", { email: email.data, redirectTo, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) loginError(error.type, redirectTo);
    throw error;
  }
  // Auth.js answers with its own /api/auth/verify-request, which only bounces to our page; going there directly
  // keeps the address bar on /login/check-email after a client-side action redirect.
  const url = new URL(next, "http://localhost");
  const error = url.searchParams.get("error");
  if (error) loginError(error, redirectTo);
  redirect(url.pathname.endsWith("/verify-request") ? "/login/check-email" : `${url.pathname}${url.search}`);
}

export async function signInWithGoogle(form: FormData): Promise<void> {
  const redirectTo = safePath(form.get("redirectTo"));
  try {
    await signIn("google", { redirectTo });
  } catch (error) {
    if (error instanceof AuthError) loginError(error.type, redirectTo);
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  // The active-workspace cookie names a workspace; on a shared machine it should not outlive the session.
  (await cookies()).delete(ORG_COOKIE);
  await signOut({ redirectTo: "/login" });
}
