import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { AssigneeStack } from "@/components/tasks/assignee-stack";
import { ResumeCard } from "@/components/tasks/detail/resume-card";
import type { EvidenceLink, TaskAbilities, TaskDetail } from "@/lib/tasks/types";

// The task a converted request became, on the request page: its title, status and who is on it, then its Resume card.

/** Nobody acts on the task from the request page; it is followed here and worked on at /tasks/[id]. */
const READ_ONLY: TaskAbilities = { edit: false, progress: false, approve: false, reject: false };

/** "Linked task": what the request turned into, where it stands and what happens next, read-only. */
export function LinkedTask({ detail, links, now, timeZone }: { detail: TaskDetail; links: EvidenceLink[]; now: Date; timeZone: string }) {
  const nobody = detail.assignees.people.length === 0 && detail.assignees.teams.length === 0;
  return (
    <section aria-labelledby="linked-task-heading" className="grid gap-2">
      <h2 id="linked-task-heading" className="px-0.5 text-sm font-semibold">
        Linked task
      </h2>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-0.5">
        <Link href={`/tasks/${detail.id}`} className="min-w-0 text-sm font-medium text-link underline-offset-4 hover:underline">
          {detail.title}
        </Link>
        <StatusBadge status={detail.status} />
        {nobody ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-5 rounded-full border border-dashed" aria-hidden />
            Unassigned
          </span>
        ) : (
          <AssigneeStack assignees={detail.assignees} names className="text-xs text-muted-foreground" />
        )}
      </div>
      <ResumeCard detail={detail} links={links} removableLinks={[]} abilities={READ_ONLY} updateContext={null} timeZone={timeZone} now={now} />
    </section>
  );
}
