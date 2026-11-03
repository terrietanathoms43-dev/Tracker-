"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** The panel every error boundary shows, so the in-shell version and the standalone pages match. */
export function ErrorPage({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Something went wrong"
      description="That page couldn't be shown. Trying again usually fixes it — if it keeps happening, tell the team."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={onRetry}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      }
    />
  );
}
