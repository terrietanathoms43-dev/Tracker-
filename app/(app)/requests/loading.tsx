import { PageSkeleton } from "@/components/skeletons";

// Skeleton for /requests while the queue streams in.

export default function Loading() {
  return <PageSkeleton rows={6} />;
}
