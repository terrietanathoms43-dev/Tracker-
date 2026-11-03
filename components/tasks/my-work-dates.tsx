"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { TaskFilters } from "@/lib/tasks/filters";
import { DateRangeFilter } from "./task-toolbar";

// My Work's "Dates" button: the same From / To range as the List tab, written to /my-work's address.

export function MyWorkDates({ filters, today }: { filters: Pick<TaskFilters, "dateField" | "from" | "to">; today: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <DateRangeFilter
      filters={filters}
      today={today}
      onApply={(next) => {
        const params = new URLSearchParams();
        if (next.dateField && (next.from || next.to)) {
          params.set("dateField", next.dateField);
          if (next.from) params.set("from", next.from);
          if (next.to) params.set("to", next.to);
        }
        const query = params.toString();
        startTransition(() => router.replace(query ? `/my-work?${query}` : "/my-work", { scroll: false }));
      }}
    />
  );
}
