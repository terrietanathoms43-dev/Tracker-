import { cn } from "cn";

/** The counter stays out of the way until this share of the cap is used. */
export const COUNTER_FROM = 0.8;

/**
 * "37 left" beside a capped field: how many characters remain, against the same LIMITS value the zod schema
 * enforces on the server. Nothing shows until the last fifth of the cap (a counter on an empty field is noise);
 * gold in the last tenth, destructive at zero or over. The element stays in the layout so nothing jumps.
 */
export function CharacterCounter({ value, max, className }: { value: string; max: number; className?: string }) {
  const left = max - value.length;
  const show = value.length >= max * COUNTER_FROM;
  return (
    <span
      aria-live="polite"
      className={cn(
        "shrink-0 text-[12px] tabular-nums",
        left <= 0 ? "text-destructive" : left <= max * 0.1 ? "text-status-awaiting-fg" : "text-muted-foreground",
        !show && "sr-only",
        className,
      )}
    >
      {show ? (left < 0 ? `${-left} over` : `${left} left`) : ""}
    </span>
  );
}
