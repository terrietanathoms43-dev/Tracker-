// How far back a leader's Home counts look (the "Completed · 30 days" tile). Plain values, shared by the server
// page and any client component (a "use client" file cannot hand plain values to the server).

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export const DEFAULT_PERIOD: Period = 30;

const DAY_MS = 86_400_000;

/** The period in an address, or 30 days when it is missing or not one of the three. */
export function parsePeriod(raw: string | string[] | undefined): Period {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (PERIODS as readonly number[]).includes(value) ? (value as Period) : DEFAULT_PERIOD;
}

/** The instant a period starts: `days` whole days before `now`. */
export function periodStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
