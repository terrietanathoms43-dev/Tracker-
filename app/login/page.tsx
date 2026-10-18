import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signInWithEmail, signInWithGoogle } from "@/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { allowedDomainsLabel } from "@/lib/allowed-domains";
import { domainRuleMessage, googleEnabled } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { safePath } from "@/lib/safe-path";
import { getSessionUser } from "@/lib/viewer";

export const metadata: Metadata = { title: "Sign in" };

// Better Auth's error codes (and our own from actions/auth.ts), said in the user's words.
const ERRORS: Record<string, string> = {
  INVALID_TOKEN: "That sign-in link has expired or was already used. Request a new one.",
  EXPIRED_TOKEN: "That sign-in link has expired. Request a new one.",
  magic_link: "That sign-in link didn't work. Request a new one.",
  google: "Google sign-in didn't complete. Try again, or use the email link.",
  unable_to_create_user: "We couldn't create an account for that Google sign-in. Try the email link instead.",
  access_denied: "Sign-in wasn't allowed for that account.",
  EmailSignInError: "We couldn't send the sign-in email. Check the address and try again.",
  EmailInvalid: "Enter a valid email address.",
};

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15.1-5.5l-7.5-5.8c-2 1.4-4.6 2.3-7.6 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

async function LoginForms({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const query = await searchParams;
  const redirectTo = safePath(query.callbackUrl);
  if ((await getSessionUser()) !== null) redirect(redirectTo);

  // Better Auth appends its own ?error= to ours, so the last value is the specific one.
  const codes = Array.isArray(query.error) ? query.error : typeof query.error === "string" ? [query.error] : [];
  const code = codes.at(-1) ?? null;
  const error =
    code === null
      ? null
      : code === "domain" || (code === "unable_to_create_user" && allowedDomainsLabel() !== null)
        ? domainRuleMessage()
        : (ERRORS[code] ?? "Couldn't sign you in. Please try again.");

  return (
    <div className="grid gap-5">
      {error ? (
        <p role="alert" className="rounded-md border border-status-blocked-dot/30 bg-status-blocked-bg px-3 py-2.5 text-sm text-status-blocked-fg">
          {error}
        </p>
      ) : null}

      {googleEnabled ? (
        <>
          <form action={signInWithGoogle}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <SubmitButton variant="outline" className="h-10 w-full" pendingLabel="Opening Google…">
              <GoogleMark />
              Continue with Google
            </SubmitButton>
          </form>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form action={signInWithEmail} className="grid gap-3">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <div className="grid gap-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" className="h-10" />
        </div>
        <SubmitButton className="h-10 w-full" pendingLabel="Sending link…">
          Email me a sign-in link
        </SubmitButton>
      </form>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="grid gap-5">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  const domains = allowedDomainsLabel();
  return (
    <AuthShell>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Sign in to {APP_NAME}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {domains ? `Use your ${domains} email. ` : ""}No password needed. New here? Signing in creates your account.
        </p>
      </div>
      <Suspense fallback={<LoginSkeleton />}>
        <LoginForms searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}
