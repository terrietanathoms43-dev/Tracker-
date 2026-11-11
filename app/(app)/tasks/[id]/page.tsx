import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupSection } from "@/components/tasks/detail/group-section";
import { ResumeCard } from "@/components/tasks/detail/resume-card";
import { SubTasksSection } from "@/components/tasks/detail/sub-tasks-section";
import { TaskDetails } from "@/components/tasks/detail/task-details";
import { TaskDrafts } from "@/components/tasks/detail/task-drafts";
import { TaskHeader } from "@/components/tasks/detail/task-header";
import { TaskHistory } from "@/components/tasks/detail/task-history";
import { CurrentTask } from "@/components/tasks/task-actions";
import { db } from "@/db";
import { chainForPlacement } from "@/lib/approvals/chain";
import { canDecideProposal, describeStepPeople } from "@/lib/approvals/policy";
import { draftsForTask } from "@/lib/dal/drafts";
import { listHistory } from "@/lib/dal/history";
import { pinnedProjectIds } from "@/lib/dal/projects";
import { activePlanning, getTask, listLinks, taskPeople, tasksForGroup, tasksForParent } from "@/lib/dal/tasks";
import { canApproveTask, canEditTask, canGroupTask, canReadTask, canRejectTask, canUpdateProgress, isWorker } from "@/lib/permissions";
import { describeRecurrence } from "@/lib/recurrence";
import { defaultApproverFor } from "@/lib/tasks/approver";
import { closerLabel } from "@/lib/tasks/closer";
import { nameOf } from "@/lib/tasks/people";
import type { TaskAbilities, UpdateContext } from "@/lib/tasks/types";
import { dayKey, formatRelative } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /tasks/[id]: one task, Resume card first.

export const metadata: Metadata = { title: "Task" };

/**
 * "What is this, what happened, what happens next, who must act?" (docs/BRIEF.md §5), answered top down:
 * the header, the Resume card with its inline update form (or the proposal's sign-off strip, or a local task's
 * strip with the chain a send would start), the details, the viewer's own drafts attached to the task (private to
 * them, 2026-11-11 log), then comments and history. A local task is found only by its maker (lib/permissions.ts
 * canReadTask). What the task is tied to comes before the details: its sub-tasks, then the tasks it is grouped
 * with (2026-11-11 log, task groups).
 */
export default async function TaskPage(props: PageProps<"/tasks/[id]">) {
  const { id } = await props.params;
  const viewer = await requireViewer();
  const worker = isWorker(viewer);
  // One round trip; nothing is rendered unless the viewer may read the task (a foreign id is simply not found).
  const [found, links, history, people, planning, pinnedProjects, drafts] = await Promise.all([
    getTask(viewer, id),
    listLinks(viewer, id),
    listHistory(viewer, id, null),
    worker ? taskPeople(viewer) : [],
    activePlanning(viewer),
    pinnedProjectIds(viewer),
    draftsForTask(viewer, id),
  ]);
  if (found === null || !canReadTask(viewer, found.scope)) notFound();
  const { detail, scope } = found;
  // Sub-tasks (2026-11-08 log): a live, top-level task lists the tasks attached to it; a sub-task has no section of its own.
  const live = detail.proposalStatus === null || detail.proposalStatus === "approved";
  const [subTasks, groupTasks] = await Promise.all([live && detail.parent === null ? tasksForParent(viewer, id) : null, detail.group !== null ? tasksForGroup(viewer, detail.group.id) : null]);
  const abilities: TaskAbilities = {
    edit: canEditTask(viewer, scope),
    progress: canUpdateProgress(viewer, scope),
    approve: canApproveTask(viewer, scope),
    reject: canRejectTask(viewer, scope),
    decideProposal: detail.proposalStatus === "pending" && canDecideProposal(viewer, detail.approvals.map((step) => ({ position: step.position, userIds: step.users.map((user) => user.id), decision: step.decision }))),
  };
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  // A local task's strip says who would sign it: the chain its placement gives its maker, read now (2026-11-06 log).
  const localChain =
    detail.proposalStatus === "local"
      ? ((await chainForPlacement(db, viewer, { projectId: detail.project?.id ?? null, goalId: detail.goal?.id ?? null })) ?? []).map((step) =>
          describeStepPeople(step.userIds.map((userId) => nameOf(people.find((person) => person.id === userId)))),
        )
      : [];
  const removableLinks = links.filter((link) => abilities.edit || (abilities.progress && link.addedBy === viewer.userId)).map((link) => link.id);
  const updateContext: UpdateContext | null = abilities.progress
    ? {
        task: {
          id: detail.id,
          title: detail.goalCloser ? closerLabel(detail.title, detail.goal?.title) : detail.title,
          status: detail.status,
          assigneeIds: scope.assigneeIds,
          nextAction: detail.nextAction,
          blockedReason: detail.blockedReason,
          blockedBy: detail.blockedBy,
          openComments: detail.openComments,
          repeats: detail.recurrence ? describeRecurrence(detail.recurrence, detail.dueDate) : null,
          parent: detail.parent,
          openSubTasks: subTasks === null ? 0 : subTasks.filter((item) => !["completed", "rejected", "deferred", "cancelled", "merged"].includes(item.status)).length,
          closer: detail.goalCloser ? { goalTitle: detail.goal?.title ?? null, openOthers: detail.closerWaitsFor } : null,
        },
        people,
        defaultApprover: defaultApproverFor(people, detail.approver?.id ?? null, scope.assigneeIds),
        abilities,
      }
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <CurrentTask id={detail.id} title={detail.goalCloser ? closerLabel(detail.title, detail.goal?.title) : detail.title} actionable={abilities.progress} />
      <TaskHeader detail={detail} abilities={abilities} today={today} />
      <div className="grid gap-5">
        <ResumeCard detail={detail} links={links} removableLinks={removableLinks} abilities={abilities} updateContext={updateContext} localChain={localChain} timeZone={viewer.timezone} now={now} />
        {subTasks !== null ? (
          <SubTasksSection task={{ id: detail.id, projectId: detail.project?.id ?? null, goalId: detail.goal?.id ?? null }} items={subTasks} today={today} canEdit={abilities.edit} readOnly={!abilities.progress} />
        ) : null}
        {detail.group !== null && groupTasks !== null ? (
          <GroupSection task={{ id: detail.id, title: detail.title }} group={detail.group} others={groupTasks.filter((item) => item.id !== detail.id)} today={today} canEdit={canGroupTask(viewer, scope)} readOnly={!abilities.progress} />
        ) : null}
        <TaskDetails
          detail={detail}
          canGroup={canGroupTask(viewer, scope) && detail.parent === null && !detail.goalCloser}
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
        <TaskDrafts drafts={drafts.map((draft) => ({ ...draft, updated: formatRelative(new Date(draft.updatedAt), now, viewer.timezone) }))} />
        <TaskHistory task={{ id: detail.id, title: detail.title, projectId: detail.project?.id ?? null, goalId: detail.goal?.id ?? null }} initial={history} canComment={abilities.progress} openComments={detail.openComments} />
      </div>
    </div>
  );
}
