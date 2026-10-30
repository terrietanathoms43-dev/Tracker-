"use client";

import { cn } from "cn";
import { Download } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportHref, type ReportCut, type ReportTable } from "@/lib/reports/params";
import { matchingPreset, PRESET_LABELS, presetRange, RANGE_PRESETS, type ReportRange } from "@/lib/reports/range";
import { formatDay } from "@/lib/time";

// The report's date range: one row of presets plus "Custom". Only Custom reveals the From / To pickers and their
// Apply button, so the row reads as one choice at a time. Everything writes `?from&to` to the address (keeping the
// current view) so a report can be shared as a link. Hidden when printing.

const PILL = "inline-flex h-8 items-center rounded-md border px-2.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ON = "border-primary bg-primary text-primary-foreground";
const OFF = "bg-background text-muted-foreground hover:bg-accent hover:text-foreground";

/** Preset links (the active one filled), then Custom, which opens a From / To form that submits as a plain GET. */
export function ReportControls({ range, today, cut }: { range: ReportRange; today: string; cut: ReportCut }) {
  const active = matchingPreset(range, today);
  // A range no preset describes is a custom one: the pickers show at once so the dates can be read and changed.
  const [customOpen, setCustomOpen] = useState(active === null);
  const custom = customOpen || active === null;
  return (
    <div data-print-hide className="grid gap-3">
      <nav aria-label="Date range" className="flex flex-wrap gap-1.5">
        {RANGE_PRESETS.map((preset) => {
          const on = !custom && preset === active;
          return (
            <Link
              key={preset}
              href={reportHref("/reports", presetRange(preset, today), { cut })}
              scroll={false}
              aria-current={on ? "page" : undefined}
              onClick={() => setCustomOpen(false)}
              className={cn(PILL, on ? ON : OFF)}
            >
              {PRESET_LABELS[preset]}
            </Link>
          );
        })}
        <button type="button" aria-pressed={custom} onClick={() => setCustomOpen(true)} className={cn(PILL, custom ? ON : OFF)}>
          Custom{active === null ? `: ${formatDay(range.from, today)} – ${formatDay(range.to, today)}` : ""}
        </button>
      </nav>
      {custom ? (
        // Keyed by the range, so a new address resets the inputs to the range it chose.
        <Form key={`${range.from}:${range.to}`} action="/reports" scroll={false} className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto">
          <input type="hidden" name="cut" value={cut} />
          <div className="grid gap-1.5">
            <Label htmlFor="report-from" className="text-[13px] font-normal text-muted-foreground">
              From
            </Label>
            <Input id="report-from" name="from" type="date" required defaultValue={range.from} max={today} className="h-8 sm:w-40" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-to" className="text-[13px] font-normal text-muted-foreground">
              To
            </Label>
            <Input id="report-to" name="to" type="date" required defaultValue={range.to} max={today} className="h-8 sm:w-40" />
          </div>
          <Button type="submit" variant="outline" size="sm" className="col-span-2 sm:col-span-1">
            Apply
          </Button>
        </Form>
      ) : null}
    </div>
  );
}

/** "CSV" in a section's header: downloads that section's table for the same range. */
export function CsvLink({ range, table, label }: { range: ReportRange; table: ReportTable; label: string }) {
  return (
    <a
      href={reportHref("/reports/export", range, { table })}
      download
      data-print-hide
      aria-label={`Download ${label} as CSV`}
      className="inline-flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <Download className="size-3" aria-hidden />
      CSV
    </a>
  );
}
