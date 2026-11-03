import { PROJECT_SCOPE_COOKIE } from "@/lib/constants";

// The project every work screen is narrowed to (docs/PLAN.md, 2026-11-03 log): one picker in the navigation,
// remembered per browser in the `trackwise.project` cookie, the way the /home tab order is. "" means the whole
// workspace. Pure, so the client picker and the server pages read the cookie the same way.

/** "" for every project, otherwise a project id. Anything else in the cookie is ignored. */
export type ProjectScope = string;

export function parseProjectScope(raw: string | undefined | null): ProjectScope {
  const value = (raw ?? "").trim();
  return /^[\w-]{1,64}$/.test(value) ? value : "";
}

export { PROJECT_SCOPE_COOKIE };

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The cookie line the browser writes; an empty scope clears it. */
export function projectScopeCookie(scope: ProjectScope): string {
  return `${PROJECT_SCOPE_COOKIE}=${encodeURIComponent(scope)}; path=/; max-age=${scope === "" ? 0 : COOKIE_MAX_AGE}; samesite=lax`;
}
