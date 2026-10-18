import { Skeleton } from "@/components/ui/skeleton";

// loading.tsx fallbacks for the goal and project screens, shaped like the cards and sections they stand in for.

/** A card's silhouette: title, meta line, progress label and bar. */
function CardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <Skeleton className="h-4 w-3/4" />
      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="mt-5 h-3 w-32" />
      <Skeleton className="mt-1.5 h-1.5 w-full rounded-full" />
    </div>
  );
}

/** Goals and Projects lists: header (with the Tasks sub-tabs on Projects), then a grid of cards. */
export function PlanningListSkeleton({ tabs = false, cards = 4 }: { tabs?: boolean; cards?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          {tabs ? null : <Skeleton className="h-4 w-72 max-w-[60vw]" />}
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      {tabs ? (
        <div className="-mt-2 mb-5 flex h-9 items-center gap-5 border-b">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-14" />
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: cards }, (_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

/** A goal or project page: back link, title, meta, the summary card, then a section of rows. */
export function PlanningDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3.5 w-14" />
      <div className="mt-3 flex items-start justify-between gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-9 w-20" />
      </div>
      <div className="mt-3 flex gap-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="mt-5 rounded-lg border bg-card p-4 md:p-5">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <Skeleton className="mt-5 h-4 w-40" />
        <Skeleton className="mt-2 h-2.5 w-full rounded-full" />
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mt-3 divide-y rounded-lg border bg-card">
        {Array.from({ length: 4 }, (_, index) => (
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
