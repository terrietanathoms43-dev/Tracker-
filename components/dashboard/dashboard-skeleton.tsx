import { Skeleton } from "@/components/ui/skeleton";

// The loading.tsx fallback for the dashboard pages (Team, Home): header, optional count tiles, then two columns
// of panels the same shape as the real ones, so nothing jumps when the page streams in.

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="size-6 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** `tiles` adds the count-tile row; `columns={false}` stacks the panels (a member's Home). */
export function DashboardSkeleton({ tiles = true, columns = true }: { tiles?: boolean; columns?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-56 max-w-[60vw]" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-6">
        {tiles ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className={index === 0 ? "col-span-2 h-[74px] rounded-lg sm:col-span-1" : "h-[74px] rounded-lg"} />
            ))}
          </div>
        ) : null}
        <PanelSkeleton rows={5} />
        {columns ? (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="grid gap-6">
              <PanelSkeleton rows={4} />
              <PanelSkeleton rows={2} />
            </div>
            <PanelSkeleton rows={6} />
          </div>
        ) : (
          <>
            <PanelSkeleton rows={1} />
            <PanelSkeleton rows={4} />
          </>
        )}
      </div>
    </div>
  );
}
