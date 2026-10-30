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

// Search, status and "Only mine" for /requests, all kept in the URL so a view can be shared.

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

  return (
    <div className={cn("mb-6 flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-70")}>
      <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
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
          className="pl-8"
        />
      </div>
      <NativeSelect aria-label="Status" className="w-44" value={filters.status} onChange={(event) => apply({ status: event.target.value as RequestStatus | "" })}>
        <option value="">Any status</option>
        {REQUEST_STATUSES.map((status) => (
          <option key={status} value={status}>
            {REQUEST_STATUS_LABELS[status]}
          </option>
        ))}
      </NativeSelect>
      <div className="flex h-9 items-center gap-2 px-1">
        <Switch id="requests-mine" checked={filters.mine} onCheckedChange={(mine) => apply({ mine })} />
        <Label htmlFor="requests-mine" className="text-[13px] font-normal text-muted-foreground">
          Only mine
        </Label>
      </div>
      {isRequestFiltered(filters) ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            setQ("");
            apply(DEFAULT_REQUEST_FILTERS);
          }}
        >
          <X aria-hidden />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
