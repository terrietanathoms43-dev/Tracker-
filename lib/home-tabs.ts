import { HOME_TABS_COOKIE, type OrgRole } from "@/lib/constants";

// The /home tab row (docs/PLAN.md §2): List · Board · Projects · Home, each person's order remembered in the
// `trackwise.homeTabs` cookie (a preference, not data — the browser owns it; the server only reads it to pick
// the tab a bare /home opens on). Everything here is pure so it can be unit-tested and shared between
// server and client.

export const HOME_TAB_KEYS = ["home", "list", "board", "projects"] as const;
export type HomeTab = (typeof HOME_TAB_KEYS)[number];

/** The canonical row order the defaults start from; the landing tab leads. */
const CANONICAL_ORDER: HomeTab[] = ["list", "board", "projects", "home"];

export const HOME_TAB_LABELS: Record<HomeTab, string> = {
  home: "Home",
  list: "List",
  board: "Board",
  projects: "Projects",
};

export type HomeTabConfig = {
  /** Tab order; every allowed tab appears exactly once. The first one is where /home opens. */
  order: HomeTab[];
};

/** The tabs a role may see: a stakeholder's Home is their requests, so they never get the work views. */
export function tabsForRole(role: OrgRole): HomeTab[] {
  return role === "stakeholder" ? ["home"] : [...HOME_TAB_KEYS];
}

/** Out of the box: workers land on the list, admins and stakeholders on Home (the old /home screen). */
export function defaultTabConfig(role: OrgRole): HomeTabConfig {
  const landing: HomeTab = role === "admin" || role === "stakeholder" ? "home" : "list";
  const allowed = tabsForRole(role);
  return { order: [landing, ...CANONICAL_ORDER.filter((tab) => tab !== landing && allowed.includes(tab))] };
}

const isTab = (value: unknown): value is HomeTab => typeof value === "string" && (HOME_TAB_KEYS as readonly string[]).includes(value);

/** Anything unexpected in the cookie is dropped rather than trusted, like the URL filter parsers. */
export function parseTabConfig(value: unknown): Partial<HomeTabConfig> {
  if (typeof value !== "object" || value === null) return {};
  const raw = value as Record<string, unknown>;
  return {
    order: Array.isArray(raw.order) ? [...new Set(raw.order.filter(isTab))] : undefined,
  };
}

/** The parsed cookie merged over the role defaults, guaranteed valid: known tabs only, every tab present. */
export function resolveTabConfig(value: unknown, role: OrgRole): HomeTabConfig {
  const allowed = tabsForRole(role);
  const parsed = parseTabConfig(value);
  const savedOrder = (parsed.order ?? []).filter((tab) => allowed.includes(tab));
  const order = [...savedOrder, ...CANONICAL_ORDER.filter((tab) => allowed.includes(tab) && !savedOrder.includes(tab))];
  return { order };
}

/** Where a bare /home opens: the person's first tab. */
export function landingTab(config: HomeTabConfig): HomeTab {
  return config.order[0];
}

/** Reads `?view=` as a tab: absent and anything unknown is null so the caller falls back to the landing. */
export function parseTabParam(view: string): HomeTab | null {
  if (view === "") return null;
  return isTab(view) ? view : null;
}

export function serializeTabConfig(config: HomeTabConfig): string {
  return JSON.stringify(config);
}

/** The cookie string back into a config object for the role. */
export function decodeTabConfig(raw: string | undefined, role: OrgRole): HomeTabConfig {
  if (!raw) return defaultTabConfig(role);
  try {
    return resolveTabConfig(JSON.parse(raw), role);
  } catch {
    return defaultTabConfig(role);
  }
}

export { HOME_TABS_COOKIE };
