import type { ReactNode } from "react";
import { CharacterCounter } from "@/components/character-counter";
import { Label } from "@/components/ui/label";

/** Label, control, then either a hint or the field's error, with the character counter at the end of that line. */
export function Field({
  id,
  label,
  hint,
  error,
  count,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Shows "n / max" under the control; the max is one of LIMITS, so it matches what the server enforces. */
  count?: { value: string; max: number };
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error || hint || count ? (
        <div className="flex items-start justify-between gap-3">
          {error ? (
            <p id={`${id}-error`} className="min-w-0 flex-1 text-[13px] text-destructive">
              {error}
            </p>
          ) : hint ? (
            <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{hint}</p>
          ) : (
            <span className="flex-1" />
          )}
          {count ? <CharacterCounter {...count} /> : null}
        </div>
      ) : null}
    </div>
  );
}
