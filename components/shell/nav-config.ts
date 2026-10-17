import { House, Inbox, ListChecks, SquareCheckBig, Target, Users, type LucideIcon } from "lucide-react";
import type { NavKey } from "@/lib/permissions";

/** The six destinations (docs/PLAN.md §2). Which of them a role sees is decided by navFor() in lib/permissions.ts. */
export const NAV_ITEMS: Record<NavKey, { href: string; label: string; icon: LucideIcon }> = {
  home: { href: "/home", label: "Home", icon: House },
  "my-work": { href: "/my-work", label: "My Work", icon: ListChecks },
  tasks: { href: "/tasks", label: "Tasks", icon: SquareCheckBig },
  goals: { href: "/goals", label: "Goals", icon: Target },
  team: { href: "/team", label: "Team", icon: Users },
  requests: { href: "/requests", label: "Requests", icon: Inbox },
};

/** Projects live under Tasks in the navigation, so /projects lights up the Tasks item. */
export function isActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  return href === "/tasks" && (pathname === "/projects" || pathname.startsWith("/projects/"));
}
