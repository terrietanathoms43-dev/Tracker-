import type { Metadata } from "next";
import { HomeView } from "@/components/home/home-view";
import { NoWorkspaceHome } from "@/components/home/no-workspace-home";
import { ProjectsView } from "@/components/projects/projects-view";
import { TasksView } from "@/components/tasks/tasks-view";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { listInvitationsForEmail } from "@/lib/dal/invitations";
import { landingTab, parseTabParam, tabsForRole } from "@/lib/home-tabs";
import { readHomeTabConfig } from "@/lib/home-tabs-server";
import { isStakeholder } from "@/lib/permissions";
import { parseFilters } from "@/lib/tasks/filters";
import { safeTimeZone } from "@/lib/time";
import { getViewerContext, requireUser } from "@/lib/viewer";

// /home: the first screen, and the hub the whole app hangs off (docs/PLAN.md §2). A tab row — List, Board,
// Projects, Home — sits under the header; a bare /home opens the person's landing tab (the trackwise.homeTabs
// cookie, falling back to List for members and leaders, Home for admins and stakeholders). /tasks and
// /projects redirect here, and the no-workspace state lives here too (create one, or accept an invitation).

export const metadata: Metadata = { title: "Home" };

/** The requested tab, or the landing tab when the address does not pick a valid one. */
export default async function HomePage(props: PageProps<"/home">) {
  // Signed in first (a visitor is sent to /login); only then is the clock read, so the prerender never sees it.
  const user = await requireUser();
  const context = await getViewerContext();
  const raw = await props.searchParams;

  if (context === null) {
    // Signed in, no workspace: the one screen that doesn't need one (docs/PLAN.md, 2026-10-18 log).
    const invitations = await listInvitationsForEmail(user.email);
    const now = new Date();
    return (
      <NoWorkspaceHome
        firstName={(user.name ?? "").split(" ")[0] || null}
        email={user.email}
        invitations={invitations.map((invitation) => ({ ...invitation, expiresAt: invitation.expiresAt.toISOString() }))}
        now={now}
        timeZone={safeTimeZone(user.timezone ?? DEFAULT_TIMEZONE)}
      />
    );
  }

  const { viewer, org } = context;
  const role = viewer.orgRole;
  const config = await readHomeTabConfig(role);
  const requested = parseTabParam(typeof raw.view === "string" ? raw.view : "");
  const allowed = tabsForRole(role);
  const active = requested !== null && allowed.includes(requested) && !(isStakeholder(viewer) && requested !== "home") ? requested : landingTab(config);

  if (active === "home") return <HomeView viewer={viewer} user={user} org={org} tabsConfig={config} />;
  if (active === "projects") return <ProjectsView viewer={viewer} showAll={raw.all === "1"} tabsConfig={config} />;
  return <TasksView viewer={viewer} filters={parseFilters(raw)} view={active} tabsConfig={config} />;
}
