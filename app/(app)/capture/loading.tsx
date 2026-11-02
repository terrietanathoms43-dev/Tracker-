import { FormSkeleton } from "@/components/skeletons";

// The capture page's shape while the workspace's people, projects and goals load.
export default function Loading() {
  return <FormSkeleton cards={2} />;
}
