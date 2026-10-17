import { Suspense, type ReactNode } from "react";
import { SidebarSearch } from "@/components/shell/search-button";
import { ShortcutsHelp } from "@/components/shell/shortcuts-help";
import {
  AccountSkeleton,
  MobileTabs,
  MobileTopBar,
  NavSkeleton,
  OrgSkeleton,
  SidebarAccount,
  SidebarMainNav,
  SidebarNotifications,
  SidebarOrg,
  TabsSkeleton,
  TopBarSkeleton,
} from "@/components/shell/shell-sections";
import { TaskActionsProvider } from "@/components/tasks/task-actions";
import { Skeleton } from "@/components/ui/skeleton";

// The frame is static and prerenders; every session-dependent part streams in its own boundary, and each
// page does its own requireViewer() behind its loading.tsx (docs/PLAN.md §0, apex-architecture §3).
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <TaskActionsProvider>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
          <div className="px-3 pt-3 pb-2">
            <Suspense fallback={<OrgSkeleton />}>
              <SidebarOrg />
            </Suspense>
            <div className="mt-2">
              <SidebarSearch />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <Suspense fallback={<NavSkeleton />}>
              <SidebarMainNav />
            </Suspense>
            <div className="mt-2 border-t px-3 pt-2">
              <Suspense fallback={<Skeleton className="h-8 w-full" />}>
                <SidebarNotifications />
              </Suspense>
            </div>
          </div>
          <div className="border-t p-2">
            <Suspense fallback={<AccountSkeleton />}>
              <SidebarAccount />
            </Suspense>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur md:hidden">
            <Suspense fallback={<TopBarSkeleton />}>
              <MobileTopBar />
            </Suspense>
          </header>

          <main className="flex-1 pb-24 md:pb-10">
            <div className="mx-auto w-full max-w-[1200px] px-4 pt-6 md:px-6 md:pt-8">{children}</div>
          </main>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden">
            <Suspense fallback={<TabsSkeleton />}>
              <MobileTabs />
            </Suspense>
          </div>
        </div>
      </div>
      <ShortcutsHelp />
    </TaskActionsProvider>
  );
}
