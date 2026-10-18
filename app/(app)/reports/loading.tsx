import { Skeleton } from "@/components/ui/skeleton";

// The report's shape while it loads: header, the range controls, five tiles, then stacked sections.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64 max-w-[60vw]" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="mb-6 flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-24" />
        ))}
      </div>
      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className={index === 0 ? "col-span-2 h-[74px] rounded-lg sm:col-span-1" : "h-[74px] rounded-lg"} />
          ))}
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="space-y-3 px-4 py-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
