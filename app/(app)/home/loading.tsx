import { DashboardSkeleton } from "@/components/team/dashboard-skeleton";

// Home's shape while it loads: most people are members, so a member's stacked panels (a leader's tiles and team
// panels stream in above them).
export default function Loading() {
  return <DashboardSkeleton tiles={false} columns={false} />;
}
