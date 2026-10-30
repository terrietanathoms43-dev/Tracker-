import { cn } from "cn";

/** "37 / 200" beside a capped field: how many characters so far, against the same LIMITS value the zod
 *  schema enforces on the server. Quiet until the last tenth of the cap, gold there, destructive over it. */
export function CharacterCounter({ value, max, className }: { value: string; max: number; className?: string }) {
  const count = value.length;
  return (
    <span
      className={cn(
        "shrink-0 text-[12px] tabular-nums",
        count > max ? "text-destructive" : count >= max * 0.9 ? "text-status-awaiting-fg" : "text-muted-foreground",
        className,
      )}
    >
      {count} / {max}
    </span>
  );
}
