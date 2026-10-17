import { FormSkeleton } from "@/components/skeletons";

/** Profile, email notifications, leave: three cards under the tabs. */
export default function Loading() {
  return <FormSkeleton cards={3} withHeader={false} />;
}
