import { ArrowRight, Gauge, RotateCcw, Target } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { getSessionUser } from "@/lib/viewer";

const POINTS = [
  {
    icon: RotateCcw,
    title: "Resume where you stopped",
    text: "Every task leads with its next action and latest progress, so picking work back up takes seconds.",
  },
  {
    icon: Gauge,
    title: "Team health in a minute",
    text: "Blockers, approvals and overdue work surface on their own. No status meeting needed to find out.",
  },
  {
    icon: Target,
    title: "Goals with real progress",
    text: "Projects and tasks roll up into the goals the team agreed on: completed over total, nothing invented.",
  },
];

/** Signed-in visitors go straight to their home. */
async function SignedInRedirect() {
  if ((await getSessionUser()) !== null) redirect("/home");
  return null;
}

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={null}>
        <SignedInRedirect />
      </Suspense>
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        <section className="pt-16 pb-14 sm:pt-28 sm:pb-20">
          <h1 className="max-w-2xl text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">{APP_TAGLINE}</h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            {APP_NAME} keeps a small team&apos;s tasks, goals and decisions in one calm place: who owns what, where it stopped, and what
            happens next.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/login">
                Get started
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </section>

        <section aria-label={`What ${APP_NAME} does`} className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="bg-card p-6">
              <Icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-4 text-sm font-semibold">{title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 py-10 text-xs text-muted-foreground sm:px-6">
        No time tracking, no screenshots, no productivity scores. Just the work.
      </footer>
    </div>
  );
}
