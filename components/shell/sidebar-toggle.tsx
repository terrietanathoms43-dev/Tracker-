"use client";

import { cn } from "cn";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SIDEBAR_STORAGE_KEY } from "@/lib/sidebar";

// Minimize / show the desktop sidebar; the stored choice and the pre-paint script are in lib/sidebar.ts.

const COLLAPSE_ID = "sidebar-collapse";
const EXPAND_ID = "sidebar-expand";

function setCollapsed(collapsed: boolean, { moveFocus = true } = {}) {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  try {
    localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      collapsed ? "collapsed" : "expanded",
    );
  } catch {
    // Private mode or storage full: the toggle still works for this visit.
  }
  // Keep keyboard focus on the control that brings the sidebar back (or tucks it away again).
  if (moveFocus)
    document
      .getElementById(collapsed ? EXPAND_ID : COLLAPSE_ID)
      ?.focus({ preventScroll: true });
}

/** The [ shortcut (components/tasks/use-shortcuts.ts): flips the sidebar on a desktop, where there is one. Focus stays put. */
export function toggleSidebar(): boolean {
  if (!window.matchMedia("(min-width: 48rem)").matches) return false;
  setCollapsed(document.documentElement.dataset.sidebar !== "collapsed", {
    moveFocus: false,
  });
  return true;
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="ml-2 rounded border border-current/30 px-1 font-sans text-[11px] opacity-80">
      {children}
    </kbd>
  );
}

/** The sidebar's own top-left button: tucks the sidebar away. */
export function SidebarCollapseButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          id={COLLAPSE_ID}
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Minimize sidebar"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PanelLeftClose className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        Minimize sidebar<Key>[</Key>
      </TooltipContent>
    </Tooltip>
  );
}

/** Shown in the top-left corner of the page only while the sidebar is tucked away (desktop). */
export function SidebarExpandButton({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          id={EXPAND_ID}
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show sidebar"
          className={cn(
            "fixed top-3 left-3 z-40 hidden size-8 place-items-center rounded-md border bg-background/90 text-muted-foreground shadow-sm outline-none backdrop-blur transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring",
            "md:sidebar-collapsed:grid md:sidebar-collapsed:animate-in md:sidebar-collapsed:fade-in-0 md:sidebar-collapsed:slide-in-from-left-2 md:sidebar-collapsed:duration-300 md:sidebar-collapsed:delay-150 md:sidebar-collapsed:fill-mode-both",
            className,
          )}
        >
          <PanelLeftOpen className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        Show sidebar<Key>[</Key>
      </TooltipContent>
    </Tooltip>
  );
}
