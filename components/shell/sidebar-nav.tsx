"use client";

import { cn } from "cn";
import { FolderKanban } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { NavKey } from "@/lib/permissions";
import { isActive, NAV_ITEMS } from "./nav-config";

const PROJECTS_NAV = { href: "/home?view=projects", label: "Projects", icon: FolderKanban };

export function SidebarNav({ items }: { items: NavKey[] }) {
   const pathname = usePathname();
   const searchParams = useSearchParams();
   const projectsActive = (pathname === "/home" && searchParams.get("view") === "projects") || pathname === "/projects" || pathname.startsWith("/projects/");
   const sidebarKeys = items.flatMap((key) => (key === "home" && items.length > 1 ? [key, "projects" as const] : [key]));
   return (
      <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
         {sidebarKeys.map((key) => {
            const { href, label, icon: Icon } = key === "projects" ? PROJECTS_NAV : NAV_ITEMS[key];
            const active = key === "projects" ? projectsActive : key === "home" ? isActive(pathname, href) && !projectsActive : isActive(pathname, href);
            return (
               <Link
                  key={key}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                     "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors",
                     active
                        ? "bg-sidebar-accent text-primary"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
               >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
               </Link>
            );
         })}
      </nav>
   );
}
