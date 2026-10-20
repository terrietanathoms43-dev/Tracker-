"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavKey } from "@/lib/permissions";
import { isActive, NAV_ITEMS } from "./nav-config";

export function SidebarNav({ items }: { items: NavKey[] }) {
   const pathname = usePathname();
   return (
      <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
         {items.map((key) => {
            const { href, label, icon: Icon } = NAV_ITEMS[key];
            const active = isActive(pathname, href);
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
