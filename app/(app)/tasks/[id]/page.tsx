import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResumeCard } from "@/components/tasks/detail/resume-card";
import { TaskDetails } from "@/components/tasks/detail/task-details";
import { TaskHeader } from "@/components/tasks/detail/task-header";
import { TaskHistory } from "@/components/tasks/detail/task-history";
import { CurrentTask } from "@/components/tasks/task-actions";
import { listHistory } from "@/lib/dal/history";
import { activePlanning, getTask, listLinks, taskPeople } from "@/lib/dal/tasks";
import { teamOptions } from "@/lib/dal/teams";
import { canApproveTask, canEditTask, canReadTask, canRejectTask, canUpdateProgress, isWorker } from "@/lib/permissions";
import { defaultApproverFor } from "@/lib/tasks/approver";
import type { TaskAbilities, UpdateContext } from "@/lib/tasks/types";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /tasks/[id]: one task, Resume card first.

export const metadata: Metadata = { title: "Task" };

/**
 * "What is this, what happened, what happens next, who must act?" (docs/BRIEF.md §5), answered top down:
 * the header, the Resume card with its inline update form, the details, then comments and history.
 */
export default async function TaskPage(props: PageProps<"/tasks/[id]">) {
  const { id } = await props.params;
  const viewer = await requireViewer();
  const worker = isWorker(viewer);
  // One round trip; nothing is rendered unless the viewer may read the task (a foreign id is simply not found).
  const [found, links, history, people, teams, planning] = await Promise.all([
    getTask(viewer, id),
    listLinks(viewer, id),
    listHistory(viewer, id, null),
    worker ? taskPeople(viewer) : [],
    worker ? teamOptions(viewer) : [],
    worker ? activePlanning(viewer) : { projects: [], goals: [] },
  ]);
  if (found === null || !canReadTask(viewer, found.scope)) notFound();
  const { detail, scope } = found;
  const abilities: TaskAbilities = {
    edit: canEditTask(viewer, scope),
    progress: canUpdateProgress(viewer, scope),
    approve: canApproveTask(viewer, scope),
    reject: canRejectTask(viewer, scope),
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
        },
        people,
        defaultApprover: defaultApproverFor(people, detail.approver?.id ?? null, scope.assigneeIds),
        abilities,
      }
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      {abilities.progress ? <CurrentTask id={detail.id} /> : null}
      <TaskHeader detail={detail} abilities={abilities} today={today} />
      <div className="grid gap-5">
        <ResumeCard detail={detail} links={links} removableLinks={removableLinks} abilities={abilities} updateContext={updateContext} timeZone={viewer.timezone} now={now} />
        <TaskDetails
          detail={detail}
          abilities={abilities}
          people={people.map(({ id: personId, name, email, image }) => ({ id: personId, name, email, image }))}
          teams={teams}
          viewerId={viewer.userId}
          projects={planning.projects}
          goals={planning.goals}
          today={today}
          timeZone={viewer.timezone}
          now={now}
        />
        <TaskHistory taskId={detail.id} initial={history} canComment={abilities.progress} />
      </div>
    </div>
  );
}
