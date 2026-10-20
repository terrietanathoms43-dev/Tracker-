"use client";

import { cn } from "cn";
import { BarChart3, Building2, ChevronsUpDown, Keyboard, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useTransition } from "react";
import { signOutAction } from "@/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { openShortcutsHelp } from "./shortcuts-help";

export type MenuUser = { name: string | null; email: string; image: string | null };

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * User settings, workspace, reports, theme and sign out. `variant="avatar"` is the phone top bar's compact
 * trigger; without a workspace only the theme and sign out remain.
 */
export function UserMenu({ user, variant = "full", canSeeReports, hasWorkspace = true }: { user: MenuUser; variant?: "full" | "avatar"; canSeeReports: boolean; hasWorkspace?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [signingOut, startSignOut] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-md text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
          variant === "full" ? "h-12 w-full px-2" : "size-9 justify-center rounded-full",
        )}
        aria-label="Account menu"
      >
        <UserAvatar name={user.name} email={user.email} image={user.image} size={variant === "full" ? "default" : "sm"} />
        {variant === "full" ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.name ?? user.email}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{user.email}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "full" ? "start" : "end"} side={variant === "full" ? "top" : "bottom"} className="w-60">
        {variant === "avatar" ? (
          <>
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-base font-medium">{user.name ?? user.email}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {canSeeReports ? (
          <DropdownMenuItem asChild>
            <Link href="/reports">
              <BarChart3 className="size-4" aria-hidden />
              Reports
            </Link>
          </DropdownMenuItem>
        ) : null}
        {hasWorkspace ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="size-4" aria-hidden />
                User settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/workspace">
                <Building2 className="size-4" aria-hidden />
                Workspace
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuItem onSelect={openShortcutsHelp}>
          <Keyboard className="size-4" aria-hidden />
          Keyboard shortcuts
          <kbd className="ml-auto rounded border px-1 font-sans text-[11px] text-muted-foreground">?</kbd>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[13px] font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2">
              <Icon className="size-4" aria-hidden />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={() => startSignOut(() => signOutAction())}>
          <LogOut className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
