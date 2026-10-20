import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthShell>
      <div className="mb-5 grid size-11 place-items-center rounded-full bg-status-completed-bg">
        <MailCheck className="size-5 text-status-completed-fg" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="mt-2 text-base text-muted-foreground">
        We sent you a sign-in link. It works once and expires in 24 hours. If it doesn&apos;t arrive in a minute, check your spam folder.
      </p>
      <div className="mt-8">
        <Button asChild variant="outline">
          <Link href="/login">Use a different email</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
