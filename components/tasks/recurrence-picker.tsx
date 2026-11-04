"use client";

import { cn } from "cn";
import { Repeat } from "lucide-react";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeRecurrence, RECURRENCE_UNIT_LABELS, RECURRENCE_UNITS, WEEKDAY_SHORT, weekdayOf, type Recurrence, type RecurrenceUnit } from "@/lib/recurrence";

// How often a task or goal comes round (docs/PLAN.md, 2026-11-03 log): "Doesn't repeat" by default, else every
// N days / weeks (on chosen weekdays) / months, with an optional time of day. The same control sits in the New task
// dialog, the task page, and the goal dialog, so a repeat reads the same everywhere.

const QUICK: { value: string; label: string; rule: Recurrence | null }[] = [
  { value: "", label: "Doesn't repeat", rule: null },
  { value: "day", label: "Every day", rule: { unit: "day", interval: 1 } },
  { value: "week", label: "Every week", rule: { unit: "week", interval: 1 } },
  { value: "month", label: "Every month", rule: { unit: "month", interval: 1 } },
];

export function RecurrencePicker({
  value,
  onChange,
  anchor,
  withTime = true,
  idPrefix = "repeat",
  disabled = false,
  className,
}: {
  value: Recurrence | null;
  onChange: (next: Recurrence | null) => void;
  /** The first due or target day: a weekly rule without chosen weekdays repeats on its weekday. */
  anchor: string | null;
  withTime?: boolean;
  idPrefix?: string;
  disabled?: boolean;
  className?: string;
}) {
  const unit = value?.unit ?? "";
  const set = (patch: Partial<Recurrence>) => onChange(value ? { ...value, ...patch } : null);
  const toggleWeekday = (day: number) => {
    if (!value) return;
    const current = value.weekdays && value.weekdays.length > 0 ? value.weekdays : anchor ? [weekdayOf(anchor)] : [];
    const next = current.includes(day) ? current.filter((each) => each !== day) : [...current, day].sort((a, b) => a - b);
    set({ weekdays: next.length > 0 ? next : undefined });
  };
  const chosenDays = value?.unit === "week" ? (value.weekdays && value.weekdays.length > 0 ? value.weekdays : anchor ? [weekdayOf(anchor)] : []) : [];

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          id={`${idPrefix}-unit`}
          aria-label="Repeat"
          value={unit}
          disabled={disabled}
          className="w-full sm:w-44"
          onChange={(event) => {
            const next = QUICK.find((each) => each.value === event.target.value)?.rule ?? null;
            onChange(next ? { ...next, time: value?.time } : null);
          }}
        >
          {QUICK.map((each) => (
            <option key={each.value} value={each.value}>
              {each.label}
            </option>
          ))}
        </NativeSelect>
        {value ? (
          <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            every
            <Input
              type="number"
              aria-label="Every how many"
              min={1}
              max={52}
              value={value.interval}
              disabled={disabled}
              className="h-9 w-16"
              onChange={(event) => set({ interval: Math.max(1, Math.min(52, Number(event.target.value) || 1)) })}
            />
            {value.interval === 1 ? RECURRENCE_UNIT_LABELS[value.unit as RecurrenceUnit].one : RECURRENCE_UNIT_LABELS[value.unit as RecurrenceUnit].many}
          </label>
        ) : null}
        {value && withTime ? (
          <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            at
            <Input type="time" aria-label="Time of day" value={value.time ?? ""} disabled={disabled} className="h-9 w-32" onChange={(event) => set({ time: event.target.value || undefined })} />
          </label>
        ) : null}
      </div>
      {value?.unit === "week" ? (
        <div role="group" aria-label="On which days" className="flex flex-wrap gap-1">
          {WEEKDAY_SHORT.map((label, day) => {
            const on = chosenDays.includes(day);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggleWeekday(day)}
                className={cn(
                  "h-8 min-w-10 rounded-md border px-2 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-primary bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      {value ? (
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Repeat className="size-3.5" aria-hidden />
          {describeRecurrence(value, anchor)}
          {RECURRENCE_UNITS.includes(value.unit) && anchor === null ? " · needs a first due date" : ""}
        </p>
      ) : null}
      {value ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`${idPrefix}-until`} className="text-[13px] text-muted-foreground">
            Until
          </Label>
          <Input id={`${idPrefix}-until`} type="date" value={value.until ?? ""} min={anchor ?? undefined} disabled={disabled} className="w-40" aria-label="Repeat until" onChange={(event) => set({ until: event.target.value || undefined })} />
          <span className="text-[12px] text-muted-foreground">{value.until ? "The last day it comes round." : "Optional: the last day it comes round."}</span>
        </div>
      ) : null}
    </div>
  );
}
