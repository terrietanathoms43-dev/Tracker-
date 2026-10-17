import { PageSkeleton } from "@/components/skeletons";

// Skeleton for /tasks while the list streams in.

export default function Loading() {
  return <PageSkeleton rows={8} />;
}
