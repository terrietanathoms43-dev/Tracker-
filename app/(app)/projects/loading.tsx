import { PlanningListSkeleton } from "@/components/goals/skeletons";

// Skeleton for /projects while the projects and their progress stream in.

export default function Loading() {
  return <PlanningListSkeleton tabs />;
}
