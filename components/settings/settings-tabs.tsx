"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Profile | Workspace. Plain links (not a tab widget) so each tab is its own URL and the back button works.

const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/workspace", label: "Workspace" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="mb-6 flex gap-1 border-b">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px rounded-t-md border-b-2 px-3 pb-2.5 text-base font-medium transition-colors",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
