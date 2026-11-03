import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/** Outside the app shell: a link to nowhere, or notFound() before a workspace is known. */
export default function NotFound() {
  return (
    <AuthShell>
      <EmptyState
        icon={SearchX}
        title="Not found"
        description="That page doesn't exist. If someone sent you the link, ask them to check it."
        action={
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    </AuthShell>
  );
}
