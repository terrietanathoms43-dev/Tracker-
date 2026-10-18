import { Skeleton } from "@/components/ui/skeleton";

// Skeleton for a request page, shaped like its header, decision card, the ask and the history.

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading request">
      <Skeleton className="h-3.5 w-16" />
      <Skeleton className="mt-3 h-8 w-2/3" />
      <div className="mt-3 flex gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="mt-5 space-y-5">
        <div className="space-y-4 rounded-xl border bg-card p-5 md:px-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 flex-1" />
          </div>
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="space-y-4 rounded-xl border bg-card p-5 md:px-6">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-5 md:px-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-4/5" />
        </div>
      </div>
    </div>
  );
}
