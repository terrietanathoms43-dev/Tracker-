"use client";

import { cn } from "cn";
import { Building2, LogOut, Menu, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { signOutAction } from "@/actions/auth";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavKey } from "@/lib/permissions";
import { isActive, NAV_ITEMS } from "./nav-config";

const TAB = "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors";

/** Phone navigation: up to four destinations, then More (the rest of the navigation, User settings, Workspace, Sign out). */
export function BottomTabs({ items, hasWorkspace = true }: { items: NavKey[]; hasWorkspace?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, startSignOut] = useTransition();
  const tabs = items.slice(0, 4);
  const rest = items.slice(4);
  const moreActive = isActive(pathname, "/settings") || rest.some((key) => isActive(pathname, NAV_ITEMS[key].href));

  const more = [
    ...rest.map((key) => NAV_ITEMS[key]),
    ...(hasWorkspace
      ? [
          { href: "/settings", label: "User settings", icon: Settings },
          { href: "/settings/workspace", label: "Workspace", icon: Building2 },
        ]
      : []),
  ];

  return (
    <nav aria-label="Main" className="flex h-16 items-stretch px-1 pb-[env(safe-area-inset-bottom)]">
      {tabs.map((key) => {
        const { href, label, icon: Icon } = NAV_ITEMS[key];
        const active = isActive(pathname, href);
        return (
          <Link key={key} href={href} aria-current={active ? "page" : undefined} className={cn(TAB, active ? "text-primary" : "text-muted-foreground")}>
            <Icon className="size-5" aria-hidden />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className={cn(TAB, moreActive ? "text-primary" : "text-muted-foreground", "outline-none")}>
          <Menu className="size-5" aria-hidden />
          <span>More</span>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">More destinations, settings and account</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4">
            {more.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className="flex h-11 items-center gap-3 rounded-md px-3 text-base font-medium hover:bg-accent">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {label}
              </Link>
            ))}
            <button
              type="button"
              disabled={signingOut}
              onClick={() => startSignOut(() => signOutAction())}
              className="flex h-11 items-center gap-3 rounded-md px-3 text-left text-base font-medium hover:bg-accent disabled:opacity-50"
            >
              <LogOut className="size-4 text-muted-foreground" aria-hidden />
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
