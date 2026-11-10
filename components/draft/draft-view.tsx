import { ViewTabs } from "@/components/home/view-tabs";
import { PageHeader } from "@/components/page-header";
import { captureEngineFor } from "@/lib/capture/availability";
import { captureContext } from "@/lib/dal/capture";
import { readDraft } from "@/lib/dal/drafts";
import type { HomeTabConfig } from "@/lib/home-tabs";
import { canCapture, type Viewer } from "@/lib/permissions";
import type { ScopedProject } from "@/lib/project-scope-server";
import type { SessionUser } from "@/lib/viewer";
import { DraftEditor } from "./draft-editor";

// The Draft tab of /home (docs/PLAN.md, 2026-11-04 log): the person's notepad, and, for leaders and admins, the
// capture helper that turns the notes into a project, goals and tasks.

export async function DraftView({ viewer, user, tabsConfig, scope }: { viewer: Viewer; user: SessionUser; tabsConfig: HomeTabConfig; scope: ScopedProject | null }) {
  const convert = canCapture(viewer);
  const engine = convert ? await captureEngineFor(user.email, viewer.orgId) : null;
  const [draft, context] = await Promise.all([readDraft(viewer), convert && engine ? captureContext(viewer, scope?.status === "active" ? scope.id : "") : null]);
  return (
    <>
      <PageHeader title="Draft" description="Jot anything. It saves itself. When it's ready, turn it into projects, goals and tasks." />
      <ViewTabs active="draft" config={tabsConfig} />
      <DraftEditor initial={draft} context={context} provider={engine?.provider ?? null} canConvert={convert} />
    </>
  );
}
