// How far back the Team page looks (`/team?days=7|30|90`). Plain values, shared by the server page and any
// client component (a "use client" file cannot hand plain values to the server).

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export const DEFAULT_PERIOD: Period = 30;

const DAY_MS = 86_400_000;

/** The period in the address, or 30 days when it is missing or not one of the three. */
export function parsePeriod(raw: string | string[] | undefined): Period {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (PERIODS as readonly number[]).includes(value) ? (value as Period) : DEFAULT_PERIOD;
}

/** The Team address for a period; the default stays out of the URL. */
export function teamHref(days: Period): string {
  return days === DEFAULT_PERIOD ? "/team" : `/team?days=${days}`;
}

/** The instant a period starts: `days` whole days before `now`. */
export function periodStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
