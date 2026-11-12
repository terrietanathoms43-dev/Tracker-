import { ViewTabs } from "@/components/home/view-tabs";
import { PageHeader } from "@/components/page-header";
import { captureEngineFor } from "@/lib/capture/availability";
import { captureContext } from "@/lib/dal/capture";
import { listDrafts, readDraftNote } from "@/lib/dal/drafts";
import type { HomeTabConfig } from "@/lib/home-tabs";
import { canCapture, type Viewer } from "@/lib/permissions";
import type { ScopedProject } from "@/lib/project-scope-server";
import type { SessionUser } from "@/lib/viewer";
import { DraftWorkspace } from "./draft-workspace";

// The Draft tab of /home (docs/PLAN.md, 2026-11-04 and 2026-11-11 logs): the person's drafts as a list with the
// open one beside it, and, for leaders and admins, the capture helper that turns a draft into a project, goals and
// tasks. `?draft=<id>` opens one of the person's drafts (a task's page links here); without it, or with an id that
// is not theirs, the draft changed last is open.

export async function DraftView({ viewer, user, tabsConfig, scope, draftId }: { viewer: Viewer; user: SessionUser; tabsConfig: HomeTabConfig; scope: ScopedProject | null; draftId: string }) {
  const convert = canCapture(viewer);
  const engine = convert ? await captureEngineFor(user.email, viewer.orgId) : null;
  const [drafts, context] = await Promise.all([listDrafts(viewer), convert && engine ? captureContext(viewer, scope?.status === "active" ? scope.id : "") : null]);
  const requested = drafts.find((draft) => draft.id === draftId) ?? null;
  const open = requested ?? drafts[0] ?? null;
  const current = open ? await readDraftNote(viewer, open.id) : null;
  return (
    <>
      <PageHeader title="Draft" description="Jot anything; it saves itself. Keep as many drafts as you need, attach one to a task, and turn one into projects, goals and tasks when it's ready." />
      <ViewTabs active="draft" config={tabsConfig} />
      <DraftWorkspace initial={{ drafts, current }} requested={requested?.id ?? null} context={context} provider={engine?.provider ?? null} canConvert={convert} />
    </>
  );
}
