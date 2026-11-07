import { Repeat } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PriorityGlyph } from "@/components/priority-glyph";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/constants";
import { describeRecurrence, formatTime } from "@/lib/recurrence";
import { nameOf } from "@/lib/tasks/people";
import type { GoalOption, Person, TaskAbilities, TaskDetail } from "@/lib/tasks/types";
import { AssigneeStack } from "../assignee-stack";
import { DueLabel } from "../due-label";
import { ApprovalChain } from "../proposal-strip";
import { AssigneesEditor, DescriptionEditor, DueEditor, GoalEditor, PickEditor, ProjectEditor, RecurrenceEditor, StatusEditor, TimeEditor } from "./detail-editors";

// The task page's Details card: description and the facts that rarely change.

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 text-base sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-[13px] text-muted-foreground sm:text-base">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

const link = "text-link underline-offset-4 hover:underline";

/** Keeps the task's current choice in a picker even when it is no longer offered (an archived project). */
function withCurrent<T extends { id: string }>(options: T[], current: T | null): T[] {
  return current && !options.some((option) => option.id === current.id) ? [current, ...options] : options;
}

/**
 * The facts that rarely change, below the Resume card: description, status, assignees, due (date and time),
 * repeat, priority, project, goal, approver, the sign-off chain of a proposal, and who created it when. Editors
 * get inline controls; everyone else reads text.
 */
export function TaskDetails({
  detail,
  abilities,
  people,
  viewerId,
  projects,
  pinnedProjects,
  goals,
  today,
  timeZone,
  now,
}: {
  detail: TaskDetail;
  abilities: TaskAbilities;
  people: Person[];
  viewerId: string;
  projects: { id: string; name: string }[];
  /** The viewer's pinned projects, first in the picker. */
  pinnedProjects: string[];
  goals: GoalOption[];
  today: string;
  timeZone: string;
  now: Date;
}) {
  const edit = abilities.edit;
  const live = detail.proposalStatus === null || detail.proposalStatus === "approved";
  // A sub-task lives where its parent lives (2026-11-08 log): its project and goal are read here, changed on the parent.
  const canPlace = edit && detail.parent === null;
  // The task's own goal stays offered even when it is no longer active (the picker needs it to show the name).
  const goalChoices = withCurrent(goals, detail.goal ? { ...detail.goal, projectId: detail.project?.id ?? "" } : null);
  return (
    <section aria-labelledby="details-heading" className="rounded-xl border bg-card">
      <h2 id="details-heading" className="border-b px-5 py-3 text-base font-semibold md:px-6">
        Details
      </h2>
      <div className="grid gap-3 px-5 py-4 md:px-6">
        <DescriptionEditor key={detail.description ?? ""} taskId={detail.id} description={detail.description} editable={edit} />
        <dl className="divide-y border-t">
          {live ? <Row label="Current status">{abilities.progress ? <StatusEditor taskId={detail.id} status={detail.status} allowReject={abilities.reject} hasParent={detail.parent !== null} /> : <StatusBadge status={detail.status} />}</Row> : null}
          <Row label="Assigned to">
            {edit ? (
              <AssigneesEditor key={JSON.stringify(detail.assignees)} taskId={detail.id} assignees={detail.assignees} people={people} viewerId={viewerId} />
            ) : detail.assignees.length > 0 ? (
              <AssigneeStack assignees={detail.assignees} names />
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            )}
          </Row>
          <Row label="Due">
            {edit ? (
              <div className="flex flex-wrap items-center gap-2">
                <DueEditor taskId={detail.id} due={detail.dueDate} />
                {detail.dueDate ? <TimeEditor taskId={detail.id} time={detail.dueTime} /> : null}
              </div>
            ) : detail.dueDate ? (
              <span>
                <DueLabel due={detail.dueDate} today={today} status={detail.status} className="text-base" />
                {detail.dueTime ? ` · ${formatTime(detail.dueTime)}` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">No due date</span>
            )}
          </Row>
          <Row label="Repeat">
            {edit ? (
              <RecurrenceEditor key={JSON.stringify(detail.recurrence)} taskId={detail.id} recurrence={detail.recurrence} dueDate={detail.dueDate} />
            ) : detail.recurrence ? (
              <span className="inline-flex items-center gap-1.5">
                <Repeat className="size-3.5 text-muted-foreground" aria-hidden />
                {describeRecurrence(detail.recurrence, detail.dueDate)}
              </span>
            ) : (
              <span className="text-muted-foreground">Doesn&apos;t repeat</span>
            )}
          </Row>
          <Row label="Priority">
            {edit ? (
              <PickEditor taskId={detail.id} field="priority" label="Priority" value={detail.priority} options={[...TASK_PRIORITIES].reverse().map((priority) => ({ value: priority, label: TASK_PRIORITY_LABELS[priority] }))} />
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <PriorityGlyph priority={detail.priority} />
                {TASK_PRIORITY_LABELS[detail.priority]}
              </span>
            )}
          </Row>
          <Row label="Project">
            <div className="flex flex-wrap items-center gap-2">
              {canPlace ? (
                <ProjectEditor taskId={detail.id} value={detail.project?.id ?? ""} options={withCurrent(projects, detail.project)} pinned={pinnedProjects} />
              ) : detail.project ? null : (
                <span className="text-muted-foreground">Standalone task</span>
              )}
              {detail.project ? (
                <Link href={`/projects/${detail.project.id}`} className={canPlace ? `text-[13px] ${link}` : link}>
                  {canPlace ? "Open" : detail.project.name}
                </Link>
              ) : null}
              {detail.parent !== null ? <span className="text-[13px] text-muted-foreground">Follows its parent task</span> : null}
            </div>
          </Row>
          <Row label="Goal">
            <div className="flex flex-wrap items-center gap-2">
              {canPlace ? (
                <GoalEditor taskId={detail.id} value={detail.goal?.id ?? ""} goals={goalChoices} projects={withCurrent(projects, detail.project)} projectId={detail.project?.id ?? ""} />
              ) : detail.goal ? null : (
                <span className="text-muted-foreground">No goal</span>
              )}
              {detail.goal ? (
                <Link href={`/goals/${detail.goal.id}`} className={canPlace ? `text-[13px] ${link}` : link}>
                  {canPlace ? "Open" : detail.goal.title}
                </Link>
              ) : null}
            </div>
          </Row>
          {detail.approver ? <Row label="Approver">{nameOf(detail.approver)}</Row> : null}
          {detail.approvals.length > 0 ? (
            <Row label="Sign-off">
              <ApprovalChain steps={detail.approvals} currentId={detail.approvals.find((step) => step.decision === null)?.id ?? null} />
            </Row>
          ) : null}
          <Row label={detail.proposalStatus && detail.proposalStatus !== "local" ? "Proposed" : "Created"}>
            <span className="text-muted-foreground">
              by <span className="text-foreground">{nameOf(detail.creator)}</span> · <RelativeTime date={new Date(detail.createdAt)} timeZone={timeZone} now={now} />
            </span>
          </Row>
          {detail.startedAt ? (
            <Row label="Started">
              <RelativeTime date={new Date(detail.startedAt)} timeZone={timeZone} now={now} />
            </Row>
          ) : null}
        </dl>
      </div>
    </section>
  );
}
