import { cn } from "cn";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { InviteStep, WorkspaceStep } from "@/components/onboarding/steps";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_TIMEZONE, ORG_ROLES } from "@/lib/constants";
import { getSetupState } from "@/lib/dal/orgs";
import { canManageOrg } from "@/lib/permissions";
import { timeZoneOptions } from "@/lib/time";
import { getViewerContext, requireUser } from "@/lib/viewer";

export const metadata: Metadata = { title: "Set up" };

const STEPS = ["Workspace", "Invite"] as const;

function Progress({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2 text-[13px]" aria-label="Setup progress">
      {STEPS.map((label, index) => (
        <li key={label} className="flex items-center gap-2" aria-current={index === current ? "step" : undefined}>
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full text-xs font-semibold",
              index <= current ? "bg-primary text-primary-foreground" : "border text-muted-foreground",
            )}
          >
            {index + 1}
          </span>
          <span className={index === current ? "font-medium" : "text-muted-foreground"}>{label}</span>
          {index < STEPS.length - 1 ? <span className="h-px w-6 bg-border" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

function BackHome() {
  return (
    <Link href="/home" className="mb-6 inline-flex items-center gap-1.5 rounded-md text-base text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden />
      Back
    </Link>
  );
}

/**
 * The step comes from what exists, never from client state, so a refresh or a return visit lands on the right
 * one: no workspace → create it; an admin still alone (nobody else, nobody invited) → invite; otherwise
 * done. `?new=1` creates another workspace; `?step=done` is where "Skip for now" goes.
 */
async function Onboarding({ searchParams }: Pick<PageProps<"/onboarding">, "searchParams">) {
  const query = await searchParams;
  const user = await requireUser();
  const context = await getViewerContext();

  if (context === null || query.new === "1") {
    return (
      <>
        {context === null ? null : <BackHome />}
        <Progress current={0} />
        <WorkspaceStep zones={timeZoneOptions()} defaultTimezone={context?.org.timezone ?? DEFAULT_TIMEZONE} mode={context === null ? "first" : "another"} />
      </>
    );
  }
  if (!canManageOrg(context.viewer)) redirect("/home");

  const setup = await getSetupState(context.viewer);
  const alone = setup.otherMembers === 0 && setup.pendingInvitations === 0;
  if (alone && query.step !== "done") {
    return (
      <>
        <Progress current={1} />
        <InviteStep orgName={context.org.name} roles={[...ORG_ROLES]} />
      </>
    );
  }

  const firstName = (user.name ?? "").split(" ")[0];
  return (
    <div>
      <div className="mb-5 grid size-11 place-items-center rounded-full bg-status-completed-bg">
        <CheckCircle2 className="size-5 text-status-completed-fg" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold">You&apos;re set up{firstName ? `, ${firstName}` : ""}</h1>
      <p className="mt-2 text-base text-muted-foreground">
        {context.org.name} is ready
        {setup.pendingInvitations > 0 ? ` and ${setup.pendingInvitations} ${setup.pendingInvitations === 1 ? "invitation is" : "invitations are"} on the way` : ""}.
        You can invite people, copy invitation links and change roles any time under Settings → Workspace.
      </p>
      <Button asChild className="mt-8 h-10">
        <Link href="/home">Go to home</Link>
      </Button>
    </div>
  );
}

export default function OnboardingPage(props: PageProps<"/onboarding">) {
  return (
    <AuthShell wide>
      <Suspense
        fallback={
          <div className="grid gap-4" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        }
      >
        <Onboarding searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}
