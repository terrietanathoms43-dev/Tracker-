import { Skeleton } from "@/components/ui/skeleton";

/** The loading.tsx fallback for a list-style page: header, then a few rows. */
export function PageSkeleton({ rows = 5, withAction = true }: { rows?: number; withAction?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 max-w-[60vw]" />
        </div>
        {withAction ? <Skeleton className="h-9 w-28" /> : null}
      </div>
      <div className="divide-y rounded-lg border bg-card">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="size-6 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** For settings-style pages: stacked cards. */
export function FormSkeleton({ cards = 2, withHeader = true }: { cards?: number; withHeader?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {withHeader ? (
        <div className="mb-6 space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 max-w-[60vw]" />
        </div>
      ) : null}
      <div className="space-y-6">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="space-y-4 rounded-lg border bg-card p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
