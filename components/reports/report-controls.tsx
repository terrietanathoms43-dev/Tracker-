"use client";

import { cn } from "cn";
import { Download } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportHref, type ReportCut, type ReportProject, type ReportTable } from "@/lib/reports/params";
import { CADENCE_LABELS, cadenceRange, matchingPreset, PRESET_LABELS, presetRange, RANGE_PRESETS, SCOPE_CADENCES, SCOPE_PRESETS, type RangePreset, type ReportRange, type ScopeCadence } from "@/lib/reports/range";
import { formatDay, weekdayName } from "@/lib/time";

// The report's date range: one row of spans (Week · Month · 3 months · 6 months · Year to date) plus "Custom".
// Only Custom reveals the From / To pickers and their Apply button, so the row reads as one choice at a time; the
// pickers take any day, future ones included, so a range can run past today to what is coming. Everything writes
// `?from&to` to the address (keeping the current view and project) so a report can be shared as a link. The Active
// scope view (`since`) is about one day, the day of the last report: its Custom shows a single Since picker (the
// range's From; the end plays no part there), and its row is Daily · Week · Month · 3 months (2026-11-12 log).
// Daily is the scope read every day: it opens a switch between "Every day" (since yesterday) and "Weekdays" (since
// the last working day, so a Monday reads from Friday) and says which day that came to. The address then carries
// `?cadence`, not dates, so a bookmark rolls forward; the browser remembers which of the two was used last.
// Hidden when printing.

const PILL = "inline-flex h-8 items-center rounded-md border px-2.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ON = "border-primary bg-primary text-primary-foreground";
const OFF = "bg-background text-muted-foreground hover:bg-accent hover:text-foreground";

/** Which daily cadence this browser used last: the Daily pill opens that one. Weekdays until one is chosen. */
const CADENCE_KEY = "trackwise.scopeCadence";
const subscribeToStorage = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};
const rememberedCadence = (): ScopeCadence => {
  try {
    return window.localStorage.getItem(CADENCE_KEY) === "daily" ? "daily" : "weekdays";
  } catch {
    return "weekdays";
  }
};
const serverCadence = (): ScopeCadence => "weekdays";
const rememberCadence = (cadence: ScopeCadence) => {
  try {
    window.localStorage.setItem(CADENCE_KEY, cadence);
  } catch {
    // A private window or blocked storage: the choice still holds for this address.
  }
};

/** "Fri, Nov 6": a Since day with its weekday, so a Monday that reads from Friday says so. */
const sinceDay = (day: string, today: string) => `${weekdayName(day)}, ${formatDay(day, today)}`;

/**
 * Preset links (the active one filled), then Custom, which opens a From / To form that submits as a plain GET. On
 * the Active scope (`since`) Daily comes first; while it is on (`cadence`), the row below it switches between its
 * two cadences.
 */
export function ReportControls({
  range,
  today,
  cut,
  project,
  since = false,
  cadence = null,
}: {
  range: ReportRange;
  today: string;
  cut: ReportCut;
  project: ReportProject;
  since?: boolean;
  /** The Active scope's daily cadence when the address asks for one: the range is then worked out from today. */
  cadence?: ScopeCadence | null;
}) {
  const presets: readonly RangePreset[] = since ? SCOPE_PRESETS : RANGE_PRESETS;
  const active = cadence === null ? matchingPreset(range, today, presets) : null;
  const preferred = useSyncExternalStore(subscribeToStorage, rememberedCadence, serverCadence);
  // A range neither a preset nor a cadence describes is a custom one: the pickers show at once so the dates can be
  // read and changed.
  const [customOpen, setCustomOpen] = useState(active === null && cadence === null);
  const custom = customOpen || (active === null && cadence === null);
  const daily = cadence !== null && !custom;
  return (
    <div data-print-hide className="grid gap-3">
      <nav aria-label="Date range" className="flex flex-wrap gap-1.5">
        {since ? (
          <Link
            href={reportHref("/reports", null, { cut, project, cadence: cadence ?? preferred })}
            scroll={false}
            aria-current={daily ? "page" : undefined}
            onClick={() => setCustomOpen(false)}
            className={cn(PILL, daily ? ON : OFF)}
            data-cadence-pill
          >
            Daily
          </Link>
        ) : null}
        {presets.map((preset) => {
          const on = !custom && preset === active;
          return (
            <Link
              key={preset}
              href={reportHref("/reports", presetRange(preset, today), { cut, project })}
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
          Custom{active === null && cadence === null ? (since ? `: since ${formatDay(range.from, today)}` : `: ${formatDay(range.from, today)} – ${formatDay(range.to, today)}`) : ""}
        </button>
      </nav>
      {daily && cadence !== null ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-cadence={cadence}>
          <div role="group" aria-label="Daily cadence" className="inline-flex shrink-0 rounded-md border bg-background p-0.5">
            {SCOPE_CADENCES.map((each) => {
              const on = each === cadence;
              return (
                <Link
                  key={each}
                  href={reportHref("/reports", null, { cut, project, cadence: each })}
                  scroll={false}
                  aria-current={on ? "true" : undefined}
                  title={`Since ${sinceDay(cadenceRange(each, today).from, today)}`}
                  onClick={() => rememberCadence(each)}
                  className={cn(
                    "inline-flex h-7 items-center rounded-[5px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  data-cadence-option={each}
                >
                  {CADENCE_LABELS[each]}
                </Link>
              );
            })}
          </div>
          <p className="min-w-0 text-[13px] text-muted-foreground" data-cadence-since>
            Since <strong className="font-medium text-foreground">{sinceDay(range.from, today)}</strong>
            {cadence === "weekdays" ? ": the last working day, so a Monday reads from Friday." : ": yesterday, weekends included."}
          </p>
        </div>
      ) : null}
      {custom ? (
        // Keyed by the range, so a new address resets the inputs to the range it chose.
        <Form key={`${range.from}:${range.to}`} action="/reports" scroll={false} className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto">
          <input type="hidden" name="cut" value={cut} />
          {project ? <input type="hidden" name="project" value={project} /> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="report-from" className="text-[13px] font-normal text-muted-foreground">
              {since ? "Since" : "From"}
            </Label>
            <Input id="report-from" name="from" type="date" required defaultValue={range.from} className="h-8 sm:w-40" />
          </div>
          {since ? null : (
            <div className="grid gap-1.5">
              <Label htmlFor="report-to" className="text-[13px] font-normal text-muted-foreground">
                To
              </Label>
              <Input id="report-to" name="to" type="date" required defaultValue={range.to} className="h-8 sm:w-40" />
            </div>
          )}
          <Button type="submit" variant="outline" size="sm" className={since ? undefined : "col-span-2 sm:col-span-1"}>
            Apply
          </Button>
        </Form>
      ) : null}
    </div>
  );
}

/** "CSV" in a section's header: downloads that section's table for the same range and project. */
export function CsvLink({ range, table, project, label }: { range: ReportRange; table: ReportTable; project: ReportProject; label: string }) {
  return (
    <a
      href={reportHref("/reports/export", range, { table, project })}
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
