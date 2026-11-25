"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { noteInAppNavigation } from "@/lib/in-app-history";

// Screens are never left showing old work (docs/PLAN.md, 2026-11-11 log). With Cache Components the router keeps
// the page you leave (hidden, with its scroll position and state) and shows it again on Back exactly as it was,
// so a report read before a task was completed came back still calling that task open; a tab left open while the
// work changed in another tab was just as stale. One component in the shell asks the server again in both cases:
//   - after Back or Forward, once the router has put the kept page back (its scroll position and what was
//     expanded stay: a refresh merges new data into the page, it does not remount it);
//   - when the tab or window is looked at again (visible again, focused again, or restored by the browser's own
//     back-forward cache), at most once every few seconds.
// It also tells lib/in-app-history.ts that the tab has moved inside the app, for the back link.

/** How soon after one refresh a tab that is merely looked at again may ask for another (ms). */
const QUIET_MS = 5_000;

export function RouteFreshness() {
  const router = useRouter();
  const pathname = usePathname();
  const seen = useRef<string | null>(null);
  const last = useRef(0);

  useEffect(() => {
    if (seen.current !== null && seen.current !== pathname) noteInAppNavigation();
    seen.current = pathname;
  }, [pathname]);

  useEffect(() => {
    // The page was just rendered: looking at it straight away is not a reason to fetch it again.
    last.current = Date.now();
    const refresh = (force: boolean) => {
      const now = Date.now();
      if (!force && now - last.current < QUIET_MS) return;
      last.current = now;
      router.refresh();
    };
    // popstate reaches this listener before the router's own (a child's effects run first); a task later, the
    // router has restored the kept page and the refresh is queued behind that.
    const onTraverse = () => window.setTimeout(() => refresh(true), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(false);
    };
    const onFocus = () => refresh(false);
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh(true);
    };
    window.addEventListener("popstate", onTraverse);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("popstate", onTraverse);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onShow);
    };
  }, [router]);

  return null;
}
