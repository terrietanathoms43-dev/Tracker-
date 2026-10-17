import { PageSkeleton } from "@/components/skeletons";

/** Header, then a list of rows: the shape of the notifications page. */
export default function Loading() {
  return (
    <div className="max-w-3xl">
      <PageSkeleton rows={6} withAction={false} />
    </div>
  );
}
