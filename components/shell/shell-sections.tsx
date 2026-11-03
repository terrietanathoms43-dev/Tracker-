import { Skeleton } from "@/components/ui/skeleton";
import { unreadCount } from "@/lib/dal/notifications";
import { pinnedProjectIds, projectOptions } from "@/lib/dal/projects";
import { navFor, type NavKey } from "@/lib/permissions";
import { scopedProject } from "@/lib/project-scope-server";
import { getViewerContext, requireUser } from "@/lib/viewer";
import { BottomTabs } from "./bottom-tabs";
import { NotificationBell } from "./notification-bell";
import { OrgSwitcher } from "./org-switcher";
import { ProjectScopePicker } from "./project-scope-picker";
import { SearchButton } from "./search-button";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

// The session-dependent parts of the shell. Each one sits in its own <Suspense> in app/(app)/layout.tsx;
// the viewer is React-cached, so together they cost one lookup per request. A signed-in person without a
// workspace (docs/PLAN.md, 2026-10-18 log) gets the frame with Home only: no switcher target, no bell.

/** The navigation a person without a workspace gets. */
const NO_WORKSPACE_NAV: NavKey[] = ["home"];

async function context() {
  const resolved = await getViewerContext();
  if (resolved === null) {
    const user = await requireUser();
    return { viewer: null, user: { name: user.name, email: user.email, image: user.image }, orgs: [] as { orgId: string; name: string }[] };
  }
  const { viewer, user, orgs } = resolved;
  return {
    viewer,
    user: { name: user.name, email: user.email, image: user.image },
    orgs: orgs.map(({ orgId, name }) => ({ orgId, name })),
  };
}

export async function SidebarOrg() {
  const { viewer, orgs } = await context();
  return <OrgSwitcher orgs={orgs} activeOrgId={viewer?.orgId ?? null} />;
}

/** The project every work screen is narrowed to (docs/PLAN.md, 2026-11-03 log). */
export async function SidebarProjectScope() {
  const { viewer } = await context();
  if (viewer === null) return null;
  const [options, pinned, scope] = await Promise.all([projectOptions(viewer, { activeOnly: false }), pinnedProjectIds(viewer), scopedProject(viewer)]);
  return <ProjectScopePicker options={options} pinned={pinned} value={scope?.id ?? ""} variant="nav" />;
}

export async function SidebarMainNav() {
  const { viewer } = await context();
  return <SidebarNav items={viewer ? navFor(viewer) : NO_WORKSPACE_NAV} />;
}

export async function SidebarNotifications() {
  const { viewer } = await context();
  if (viewer === null) return null;
  return <NotificationBell unread={await unreadCount(viewer)} />;
}

export async function SidebarAccount() {
  const { viewer, user } = await context();
  return <UserMenu user={user} hasWorkspace={viewer !== null} />;
}

export async function MobileTopBar() {
  const { viewer, user, orgs } = await context();
  const [unread, options, pinned, scope] = viewer ? await Promise.all([unreadCount(viewer), projectOptions(viewer, { activeOnly: false }), pinnedProjectIds(viewer), scopedProject(viewer)]) : [0, [], [], null];
  return (
    <>
      <OrgSwitcher orgs={orgs} activeOrgId={viewer?.orgId ?? null} compact />
      <div className="ml-auto flex items-center gap-1">
        {viewer ? <ProjectScopePicker options={options} pinned={pinned} value={scope?.id ?? ""} variant="icon" /> : null}
        {viewer && viewer.orgRole !== "stakeholder" ? <SearchButton /> : null}
        {viewer ? <NotificationBell unread={unread} variant="icon" /> : null}
        <UserMenu user={user} variant="avatar" hasWorkspace={viewer !== null} />
      </div>
    </>
  );
}

export async function MobileTabs() {
  const { viewer } = await context();
  return <BottomTabs items={viewer ? navFor(viewer) : NO_WORKSPACE_NAV} hasWorkspace={viewer !== null} />;
}

export function OrgSkeleton() {
  return (
    <div className="flex h-10 items-center gap-2 px-2">
      <Skeleton className="size-6 rounded-md" />
      <Skeleton className="h-4 w-28" />
    </div>
  );
}

export function NavSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 px-3">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div className="flex h-12 items-center gap-2.5 px-2">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

export function TopBarSkeleton() {
  return (
    <>
      <Skeleton className="h-6 w-32" />
      <Skeleton className="ml-auto size-8 rounded-full" />
    </>
  );
}

export function TabsSkeleton() {
  return <div className="h-16" />;
}
