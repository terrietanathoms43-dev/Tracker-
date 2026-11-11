// Whether this tab has somewhere to go back to inside the app (docs/PLAN.md, 2026-11-11 log). A back link that
// behaves like the browser's Back button needs to know: a task opened from a list goes back to that list, where
// the person left it; a task opened in a new tab, or from an emailed link, has nothing behind it and falls back
// to a plain link. Browser-only: call these from event handlers and effects, never while rendering on the server.

/** Set once this tab has moved from one screen of the app to another without a full page load. */
let moved = false;

/** The shell calls this when the address changes under it (components/shell/route-freshness.tsx). */
export function noteInAppNavigation(): void {
  moved = true;
}

/**
 * True when Back would land on another screen of this app in this tab. The Navigation API answers exactly that
 * (its history holds this site's entries only); where a browser lacks it, the tab must hold more than one entry and
 * either have moved inside the app already or have come here from one of its pages.
 */
export function canGoBackInApp(): boolean {
  if (typeof window === "undefined") return false;
  const navigation = (window as { navigation?: { canGoBack?: unknown } }).navigation;
  if (typeof navigation?.canGoBack === "boolean") return navigation.canGoBack;
  if (window.history.length <= 1) return false;
  if (moved) return true;
  try {
    return document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}
