"use client";

import { cn } from "cn";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { REQUEST_STATUS_LABELS, REQUEST_STATUSES, type RequestStatus } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { DEFAULT_REQUEST_FILTERS, isRequestFiltered, requestsHref } from "@/lib/requests/filters";
import type { RequestFilters } from "@/lib/requests/types";

// Search, status and "Only mine" for /requests, all kept in the URL so a view can be shared. A filter that is on
// takes the brand tint, and a chip row under the toolbar says what is narrowing the page.

/** A picker whose value narrows the page: the same tint as the active nav item. */
const ACTIVE = "[&>select]:border-primary [&>select]:bg-sidebar-accent [&>select]:font-medium [&>select]:text-foreground";

/** Every change is a URL change; any filter turns the review sections into one matching list. */
export function RequestToolbar({ filters }: { filters: RequestFilters }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  // The search this box last sent to (or took from) the address, and the address's search as last seen.
  const [syncedQ, setSyncedQ] = useState(filters.q);
  const [addressQ, setAddressQ] = useState(filters.q);
  const apply = (patch: Partial<RequestFilters>) => startTransition(() => router.replace(requestsHref({ ...filters, ...patch }), { scroll: false }));

  // The address changed for another reason than this box's typing (a "Clear filters" link, the back button): show it.
  if (filters.q !== addressQ) {
    setAddressQ(filters.q);
    if (filters.q !== syncedQ) {
      setSyncedQ(filters.q);
      setQ(filters.q);
    }
  }

  // Debounced search: the list follows the typing without a request per keystroke.
  useEffect(() => {
    if (q.trim() === filters.q) return;
    const timer = window.setTimeout(() => {
      setSyncedQ(q.trim());
      apply({ q: q.trim() });
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const chips: { key: string; label: string; clear: Partial<RequestFilters> }[] = [
    ...(filters.q ? [{ key: "q", label: `Search: “${filters.q}”`, clear: { q: "" } }] : []),
    ...(filters.status ? [{ key: "status", label: REQUEST_STATUS_LABELS[filters.status], clear: { status: "" as const } }] : []),
    ...(filters.mine ? [{ key: "mine", label: "Only mine", clear: { mine: false } }] : []),
  ];

  return (
    <div className={cn("mb-6 grid gap-3 transition-opacity", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
          <Search className={cn("pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2", filters.q ? "text-primary" : "text-muted-foreground")} aria-hidden />
          <Input
            data-list-search
            type="search"
            aria-label="Search requests"
            placeholder="Search requests…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            maxLength={LIMITS.search}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
            }}
            className={cn("pl-8", filters.q && "border-primary bg-sidebar-accent")}
          />
        </div>
        <NativeSelect aria-label="Status" className={cn("w-44", filters.status && ACTIVE)} value={filters.status} onChange={(event) => apply({ status: event.target.value as RequestStatus | "" })}>
          <option value="">Any status</option>
          {REQUEST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {REQUEST_STATUS_LABELS[status]}
            </option>
          ))}
        </NativeSelect>
        <div className="flex h-9 items-center gap-2 px-1">
          <Switch id="requests-mine" checked={filters.mine} onCheckedChange={(mine) => apply({ mine })} />
          <Label htmlFor="requests-mine" className={cn("text-[13px] font-normal", filters.mine ? "font-medium text-foreground" : "text-muted-foreground")}>
            Only mine
          </Label>
        </div>
      </div>
      {isRequestFiltered(filters) ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-primary/30 bg-sidebar-accent/60 px-2.5 py-1.5 text-[13px]" role="status" aria-live="polite">
          <span className="font-medium text-primary">Filtered:</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                if ("q" in chip.clear) setQ("");
                apply(chip.clear);
              }}
              className="inline-flex h-6 max-w-64 items-center gap-1 rounded-md border border-primary/30 bg-background px-2 text-foreground transition-colors hover:bg-accent"
            >
              <span className="truncate">{chip.label}</span>
              <X className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">Remove this filter</span>
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-[13px] text-primary"
            onClick={() => {
              setQ("");
              apply(DEFAULT_REQUEST_FILTERS);
            }}
          >
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
