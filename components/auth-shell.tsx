import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

/** The frame for pages outside the app shell: sign-in, invitations, onboarding. */
export function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 items-center px-4 sm:px-6">
        <Link href="/" className="rounded-md">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:pt-16">
        <div className={wide ? "w-full max-w-lg" : "w-full max-w-sm"}>{children}</div>
      </main>
    </div>
  );
}
