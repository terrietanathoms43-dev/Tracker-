import { FormSkeleton } from "@/components/skeletons";

/** Workspace, members, invitations: three cards under the tabs. */
export default function Loading() {
  return <FormSkeleton cards={3} withHeader={false} />;
}
