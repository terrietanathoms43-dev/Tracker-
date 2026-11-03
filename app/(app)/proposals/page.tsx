import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelEmpty } from "@/components/dashboard/panel";
import { ProposalList } from "@/components/proposals/proposal-list";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import { listProposals } from "@/lib/dal/approvals";
import { isStakeholder } from "@/lib/permissions";
import { scopedProject } from "@/lib/project-scope-server";
import { groupProposals } from "@/lib/proposals/sections";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /proposals (docs/PLAN.md, 2026-11-03 log): tasks that wait for sign-off before they are live. What waits for
// me, what waits for someone else, what I proposed, and what was decided lately. Narrowed to the navigation's
// project when one is chosen. A stakeholder sees their own proposals only, and proposes from here.

export const metadata: Metadata = { title: "Proposals" };

export default async function ProposalsPage() {
  const viewer = await requireViewer();
  const scope = await scopedProject(viewer);
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  const items = await listProposals(viewer, { project: scope?.id ?? "" });
  const sections = groupProposals(items);
  const stakeholder = isStakeholder(viewer);
  const clock = { today, now, timeZone: viewer.timezone };

  return (
    <>
      <PageHeader
        title="Proposals"
        description={
          stakeholder
            ? "What you've proposed, and where each one stands. A leader or admin signs it off before it is a live task."
            : `Tasks waiting for sign-off before they go live${scope ? ` in ${scope.name}` : ""}. The person whose step is up signs or declines; declined ones go back to the proposer.`
        }
      />
      {stakeholder ? <QuickAddTask today={today} defaults={scope && scope.status === "active" ? { projectId: scope.id } : {}} /> : null}
      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={stakeholder ? "You haven't proposed anything yet" : "Nothing waits for sign-off"}
          description={
            stakeholder
              ? "Propose a task above and follow it here."
              : "A task becomes a proposal when it is added to a project or goal that asks for sign-off, or when a stakeholder proposes it. Turn sign-off on from a project's or goal's page."
          }
        />
      ) : (
        <div className="grid gap-6">
          {!stakeholder ? (
            <Panel title="Waiting for you" count={sections.waitingForMe.length} highlight>
              {sections.waitingForMe.length === 0 ? <PanelEmpty>Nothing waits for your signature right now.</PanelEmpty> : <ProposalList items={sections.waitingForMe} {...clock} />}
            </Panel>
          ) : null}
          {sections.waitingOnOthers.length > 0 ? (
            <Panel title="Waiting on others" count={sections.waitingOnOthers.length}>
              <ProposalList items={sections.waitingOnOthers} {...clock} />
            </Panel>
          ) : null}
          {sections.mine.length > 0 ? (
            <Panel title={stakeholder ? "Your proposals" : "Proposed by you"} count={sections.mine.length}>
              <ProposalList items={sections.mine} {...clock} showProposer={false} />
            </Panel>
          ) : null}
          {sections.decided.length > 0 ? (
            <Panel title="Decided lately" count={sections.decided.length}>
              <ProposalList items={sections.decided} {...clock} />
            </Panel>
          ) : null}
        </div>
      )}
    </>
  );
}
