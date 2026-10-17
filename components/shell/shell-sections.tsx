import { Skeleton } from "@/components/ui/skeleton";
import { unreadCount } from "@/lib/dal/notifications";
import { canSeeReports, navFor } from "@/lib/permissions";
import { requireViewerContext } from "@/lib/viewer";
import { BottomTabs } from "./bottom-tabs";
import { NotificationBell } from "./notification-bell";
import { OrgSwitcher } from "./org-switcher";
import { SearchButton } from "./search-button";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

// The session-dependent parts of the shell. Each one sits in its own <Suspense> in app/(app)/layout.tsx;
// requireViewerContext is React-cached, so together they cost one lookup per request.

async function context() {
  const { viewer, user, orgs } = await requireViewerContext();
  return {
    viewer,
    user: { name: user.name, email: user.email, image: user.image },
    orgs: orgs.map(({ orgId, name }) => ({ orgId, name })),
  };
}

export async function SidebarOrg() {
  const { viewer, orgs } = await context();
  return <OrgSwitcher orgs={orgs} activeOrgId={viewer.orgId} />;
}

export async function SidebarMainNav() {
  const { viewer } = await context();
  return <SidebarNav items={navFor(viewer)} />;
}

export async function SidebarNotifications() {
  const { viewer } = await context();
  return <NotificationBell unread={await unreadCount(viewer)} />;
}

export async function SidebarAccount() {
  const { viewer, user } = await context();
  return <UserMenu user={user} canSeeReports={canSeeReports(viewer)} />;
}

export async function MobileTopBar() {
  const { viewer, user, orgs } = await context();
  const unread = await unreadCount(viewer);
  return (
    <>
      <OrgSwitcher orgs={orgs} activeOrgId={viewer.orgId} compact />
      <div className="ml-auto flex items-center gap-1">
        {viewer.orgRole !== "stakeholder" ? <SearchButton /> : null}
        <NotificationBell unread={unread} variant="icon" />
        <UserMenu user={user} variant="avatar" canSeeReports={canSeeReports(viewer)} />
      </div>
    </>
  );
}

export async function MobileTabs() {
  const { viewer } = await context();
  return <BottomTabs items={navFor(viewer)} canSeeReports={canSeeReports(viewer)} />;
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
