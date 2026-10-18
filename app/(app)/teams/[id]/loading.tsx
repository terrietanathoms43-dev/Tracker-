import { PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageSkeleton rows={6} />
    </div>
  );
}
