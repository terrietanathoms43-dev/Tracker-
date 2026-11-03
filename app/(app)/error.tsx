"use client";

import { useEffect } from "react";
import { ErrorPage } from "@/components/error-page";
import { errorFields, log } from "@/lib/log";

/** Inside the app shell: the sidebar stays and only the page's content area is replaced. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    log.error("error_boundary", { digest: error.digest, ...errorFields(error) });
  }, [error]);
  return (
    <div className="mx-auto max-w-xl pt-10">
      <ErrorPage onRetry={retry} />
    </div>
  );
}
