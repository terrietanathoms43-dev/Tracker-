import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ORG_ROLE_LABELS } from "@/lib/constants";
import { greetingFor } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

export const metadata: Metadata = { title: "Home" };

/** The first screen. Foundation version: greeting and an empty state; Step C replaces the body with role-aware panels. */
export default async function HomePage() {
  const { viewer, user, org } = await requireViewerContext();
  const firstName = (user.name ?? "").split(" ")[0] || null;
  return (
    <>
      <PageHeader title={`${greetingFor(viewer.timezone)}${firstName ? `, ${firstName}` : ""}`} description={`${org.name} · ${ORG_ROLE_LABELS[viewer.orgRole]}`} />
      <EmptyState icon={Sparkles} title="Your workspace is ready" description="Tasks, goals and requests will show up here as the team adds them." />
    </>
  );
}
