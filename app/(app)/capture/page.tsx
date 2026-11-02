import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CaptureFlow } from "@/components/capture/capture-flow";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { captureProviderFor } from "@/lib/capture/availability";
import { captureContext } from "@/lib/dal/capture";
import { canCapture, isAdmin } from "@/lib/permissions";
import { requireViewerContext } from "@/lib/viewer";

// /capture: a meeting transcript in, a draft of goals and tasks under a project out, approved by a person before
// anything is created (docs/PLAN.md, 2026-11-01 log). Leaders and admins only; hidden until the server has a key.

export const metadata: Metadata = { title: "From a meeting" };

export default async function CapturePage(props: PageProps<"/capture">) {
  const { viewer, user } = await requireViewerContext();
  if (!canCapture(viewer)) redirect("/home");
  const raw = await props.searchParams;
  const requested = typeof raw.project === "string" && /^[\w-]{1,64}$/.test(raw.project) ? raw.project : "";
  const provider = captureProviderFor(user.email);

  if (provider === null) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="From a meeting" description="Turn a transcript or meeting notes into goals and tasks you approve." />
        <EmptyState
          icon={KeyRound}
          title="Not switched on for this server yet"
          description={
            isAdmin(viewer)
              ? "Set ANTHROPIC_API_KEY in the server's environment (see .env.example) and restart. Until then nothing leaves the server."
              : "Ask a workspace admin to switch it on; it needs a key on the server."
          }
        />
      </div>
    );
  }

  const context = await captureContext(viewer, requested);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="From a meeting" description="Paste the transcript or your notes. The helper proposes goals and tasks under a project; nothing is created until you approve it." />
      <CaptureFlow context={context} provider={provider} />
    </div>
  );
}
