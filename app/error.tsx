"use client";

import { useEffect } from "react";
import { AuthShell } from "@/components/auth-shell";
import { ErrorPage } from "@/components/error-page";
import { errorFields, log } from "@/lib/log";

/** Outside the app shell (landing, sign-in, invitations), or when the shell itself failed. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    log.error("error_boundary", { digest: error.digest, ...errorFields(error) });
  }, [error]);
  return (
    <AuthShell>
      <ErrorPage onRetry={retry} />
    </AuthShell>
  );
}
