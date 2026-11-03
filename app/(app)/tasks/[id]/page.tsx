import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResumeCard } from "@/components/tasks/detail/resume-card";
import { TaskDetails } from "@/components/tasks/detail/task-details";
import { TaskHeader } from "@/components/tasks/detail/task-header";
import { TaskHistory } from "@/components/tasks/detail/task-history";
import { CurrentTask } from "@/components/tasks/task-actions";
import { canDecideProposal } from "@/lib/approvals/policy";
import { listHistory } from "@/lib/dal/history";
import { pinnedProjectIds } from "@/lib/dal/projects";
import { activePlanning, getTask, listLinks, taskPeople } from "@/lib/dal/tasks";
import { canApproveTask, canEditTask, canReadTask, canRejectTask, canUpdateProgress, isWorker } from "@/lib/permissions";
import { describeRecurrence } from "@/lib/recurrence";
import { defaultApproverFor } from "@/lib/tasks/approver";
import type { TaskAbilities, UpdateContext } from "@/lib/tasks/types";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /tasks/[id]: one task, Resume card first.

export const metadata: Metadata = { title: "Task" };

/**
 * "What is this, what happened, what happens next, who must act?" (docs/BRIEF.md §5), answered top down:
 * the header, the Resume card with its inline update form (or the proposal's sign-off strip), the details, then
 * comments and history.
 */
export default async function TaskPage(props: PageProps<"/tasks/[id]">) {
  const { id } = await props.params;
  const viewer = await requireViewer();
  const worker = isWorker(viewer);
  // One round trip; nothing is rendered unless the viewer may read the task (a foreign id is simply not found).
  const [found, links, history, people, planning, pinnedProjects] = await Promise.all([
    getTask(viewer, id),
    listLinks(viewer, id),
    listHistory(viewer, id, null),
    worker ? taskPeople(viewer) : [],
    activePlanning(viewer),
    pinnedProjectIds(viewer),
  ]);
  if (found === null || !canReadTask(viewer, found.scope)) notFound();
  const { detail, scope } = found;
  const abilities: TaskAbilities = {
    edit: canEditTask(viewer, scope),
    progress: canUpdateProgress(viewer, scope),
    approve: canApproveTask(viewer, scope),
    reject: canRejectTask(viewer, scope),
    decideProposal: detail.proposalStatus === "pending" && canDecideProposal(viewer, detail.approvals.map((step) => ({ position: step.position, userId: step.user?.id ?? null, decision: step.decision }))),
  };
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  const removableLinks = links.filter((link) => abilities.edit || (abilities.progress && link.addedBy === viewer.userId)).map((link) => link.id);
  const updateContext: UpdateContext | null = abilities.progress
    ? {
        task: {
          id: detail.id,
          title: detail.title,
          status: detail.status,
          assigneeIds: scope.assigneeIds,
          nextAction: detail.nextAction,
          blockedReason: detail.blockedReason,
          blockedBy: detail.blockedBy,
          openComments: detail.openComments,
          repeats: detail.recurrence ? describeRecurrence(detail.recurrence, detail.dueDate) : null,
        },
        people,
        defaultApprover: defaultApproverFor(people, detail.approver?.id ?? null, scope.assigneeIds),
        abilities,
      }
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <CurrentTask id={detail.id} title={detail.title} actionable={abilities.progress} />
      <TaskHeader detail={detail} abilities={abilities} today={today} />
      <div className="grid gap-5">
        <ResumeCard detail={detail} links={links} removableLinks={removableLinks} abilities={abilities} updateContext={updateContext} timeZone={viewer.timezone} now={now} />
        <TaskDetails
          detail={detail}
          abilities={abilities}
          people={people.map(({ id: personId, name, email, image }) => ({ id: personId, name, email, image }))}
          viewerId={viewer.userId}
          projects={planning.projects}
          pinnedProjects={pinnedProjects}
          goals={planning.goals}
          today={today}
          timeZone={viewer.timezone}
          now={now}
        />
        <TaskHistory taskId={detail.id} initial={history} canComment={abilities.progress} openComments={detail.openComments} />
      </div>
    </div>
  );
}
