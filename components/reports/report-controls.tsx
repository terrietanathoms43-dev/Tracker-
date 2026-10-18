import { cn } from "cn";
import { Download } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportHref, type ReportTable } from "@/lib/reports/params";
import { matchingPreset, PRESET_LABELS, presetRange, RANGE_PRESETS, type ReportRange } from "@/lib/reports/range";

// The report's date range: preset links and two native date inputs, all writing `?from&to` to the address so a
// report can be shared as a link. Hidden when printing.

/** Presets as links (the active one filled) and a From / To form that submits as a plain GET. */
export function ReportControls({ range, today }: { range: ReportRange; today: string }) {
  const active = matchingPreset(range, today);
  return (
    <div data-print-hide className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <nav aria-label="Date range" className="flex flex-wrap gap-1.5">
        {RANGE_PRESETS.map((preset) => {
          const on = preset === active;
          return (
            <Link
              key={preset}
              href={reportHref("/reports", presetRange(preset, today))}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {PRESET_LABELS[preset]}
            </Link>
          );
        })}
      </nav>
      {/* Keyed by the range, so choosing a preset resets the inputs to the range it chose. */}
      <Form key={`${range.from}:${range.to}`} action="/reports" scroll={false} className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto">
        <div className="grid gap-1.5">
          <Label htmlFor="report-from" className="text-xs font-normal text-muted-foreground">
            From
          </Label>
          <Input id="report-from" name="from" type="date" required defaultValue={range.from} className="h-8 sm:w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="report-to" className="text-xs font-normal text-muted-foreground">
            To
          </Label>
          <Input id="report-to" name="to" type="date" required defaultValue={range.to} className="h-8 sm:w-40" />
        </div>
        <Button type="submit" variant="outline" size="sm" className="col-span-2 sm:col-span-1">
          Apply
        </Button>
      </Form>
    </div>
  );
}

/** "CSV" in a section's header: downloads that section's table for the same range. */
export function CsvLink({ range, table, label }: { range: ReportRange; table: ReportTable; label: string }) {
  return (
    <a
      href={reportHref("/reports/export", range, table)}
      download
      data-print-hide
      aria-label={`Download ${label} as CSV`}
      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <Download className="size-3" aria-hidden />
      CSV
    </a>
  );
}
