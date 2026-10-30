import { BarChart3, House, Inbox, ListChecks, SquareCheckBig, Target, Users, type LucideIcon } from "lucide-react";
import type { NavKey } from "@/lib/permissions";

/** The destinations (docs/PLAN.md §2). Which of them a role sees is decided by navFor() in lib/permissions.ts.
 *  The tasks views live in the /home tab row, so there is no Tasks item; Home goes to the bare address, which
 *  opens the person's landing tab. */
export const NAV_ITEMS: Record<NavKey, { href: string; label: string; icon: LucideIcon }> = {
  home: { href: "/home", label: "Home", icon: House },
  "my-work": { href: "/my-work", label: "My Work", icon: ListChecks },
  /** Not in navFor: kept for anything that still wants a Tasks entry (e.g. the ⌘K palette). */
  tasks: { href: "/home?view=list", label: "Tasks", icon: SquareCheckBig },
  goals: { href: "/goals", label: "Goals", icon: Target },
  members: { href: "/members", label: "Members", icon: Users },
  requests: { href: "/requests", label: "Requests", icon: Inbox },
  reports: { href: "/reports", label: "Reports", icon: BarChart3 },
};

/**
 * Whether a nav item is on. Home covers the whole /home hub, whichever tab is showing, plus the task and
 * project detail pages that belong to it.
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/home") return pathname === "/home" || pathname.startsWith("/tasks/") || pathname === "/projects" || pathname.startsWith("/projects/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
