import Link from "next/link";
import type { ReactNode } from "react";
import { PriorityGlyph } from "@/components/priority-glyph";
import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/constants";
import { nameOf } from "@/lib/tasks/people";
import type { Person, TaskAbilities, TaskDetail } from "@/lib/tasks/types";
import { DueLabel } from "../due-label";
import { DescriptionEditor, DueEditor, PickEditor, StatusEditor } from "./detail-editors";

// The task page's Details card: description and the facts that rarely change.

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
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
 * The facts that rarely change, below the Resume card: description, status, assignee, due, priority, project,
 * goal, approver, the request it came from, and who created it when. Editors get inline controls; everyone else
 * reads text.
 */
export function TaskDetails({
  detail,
  abilities,
  people,
  projects,
  goals,
  today,
  timeZone,
  now,
}: {
  detail: TaskDetail;
  abilities: TaskAbilities;
  people: Person[];
  projects: { id: string; name: string }[];
  goals: { id: string; title: string }[];
  today: string;
  timeZone: string;
  now: Date;
}) {
  const edit = abilities.edit;
  // Projects and goals are pages for the people who work here; a stakeholder sees their names only.
  const planning = abilities.progress;
  return (
    <section aria-labelledby="details-heading" className="rounded-xl border bg-card">
      <h2 id="details-heading" className="border-b px-5 py-3 text-sm font-semibold md:px-6">
        Details
      </h2>
      <div className="grid gap-3 px-5 py-4 md:px-6">
        <DescriptionEditor key={detail.description ?? ""} taskId={detail.id} description={detail.description} editable={edit} />
        <dl className="divide-y border-t">
          <Row label="Status">{abilities.progress ? <StatusEditor taskId={detail.id} status={detail.status} allowReject={abilities.reject} /> : <StatusBadge status={detail.status} />}</Row>
          <Row label="Assignee">
            {edit ? (
              <PickEditor
                taskId={detail.id}
                field="assigneeId"
                label="Assignee"
                value={detail.assignee?.id ?? ""}
                none="Unassigned"
                options={withCurrent(people, detail.assignee).map((person) => ({ value: person.id, label: nameOf(person) }))}
              />
            ) : detail.assignee ? (
              <span className="inline-flex items-center gap-2">
                <UserAvatar name={detail.assignee.name} email={detail.assignee.email} image={detail.assignee.image} size="sm" />
                {nameOf(detail.assignee)}
              </span>
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            )}
          </Row>
          <Row label="Due">
            {edit ? <DueEditor taskId={detail.id} due={detail.dueDate} /> : detail.dueDate ? <DueLabel due={detail.dueDate} today={today} status={detail.status} className="text-sm" /> : <span className="text-muted-foreground">No due date</span>}
          </Row>
          <Row label="Priority">
            {edit ? (
              <PickEditor
                taskId={detail.id}
                field="priority"
                label="Priority"
                value={detail.priority}
                options={[...TASK_PRIORITIES].reverse().map((priority) => ({ value: priority, label: TASK_PRIORITY_LABELS[priority] }))}
              />
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <PriorityGlyph priority={detail.priority} />
                {TASK_PRIORITY_LABELS[detail.priority]}
              </span>
            )}
          </Row>
          <Row label="Project">
            <div className="flex flex-wrap items-center gap-2">
              {edit ? (
                <PickEditor taskId={detail.id} field="projectId" label="Project" value={detail.project?.id ?? ""} none="No project" options={withCurrent(projects, detail.project).map((p) => ({ value: p.id, label: p.name }))} />
              ) : detail.project ? null : (
                <span className="text-muted-foreground">No project</span>
              )}
              {detail.project && !planning ? <span>{detail.project.name}</span> : null}
              {detail.project && planning ? (
                <Link href={`/projects/${detail.project.id}`} className={edit ? `text-xs ${link}` : link}>
                  {edit ? "Open" : detail.project.name}
                </Link>
              ) : null}
            </div>
          </Row>
          <Row label="Goal">
            <div className="flex flex-wrap items-center gap-2">
              {edit ? (
                <PickEditor taskId={detail.id} field="goalId" label="Goal" value={detail.goal?.id ?? ""} none="No goal" options={withCurrent(goals, detail.goal).map((g) => ({ value: g.id, label: g.title }))} />
              ) : detail.goal ? null : (
                <span className="text-muted-foreground">No goal</span>
              )}
              {detail.goal && !planning ? <span>{detail.goal.title}</span> : null}
              {detail.goal && planning ? (
                <Link href={`/goals/${detail.goal.id}`} className={edit ? `text-xs ${link}` : link}>
                  {edit ? "Open" : detail.goal.title}
                </Link>
              ) : null}
            </div>
          </Row>
          {detail.approver ? <Row label="Approver">{nameOf(detail.approver)}</Row> : null}
          {detail.request ? (
            <Row label="From request">
              <Link href={`/requests/${detail.request.id}`} className={link}>
                {detail.request.title}
              </Link>
            </Row>
          ) : null}
          <Row label="Created">
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
