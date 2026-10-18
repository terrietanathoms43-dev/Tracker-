import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusIcon } from "@/components/status-badge";
import { DueLabel } from "@/components/tasks/due-label";
import { PanelEmpty } from "@/components/team/panel";
import { TASK_STATUS_LABELS } from "@/lib/constants";
import type { ReportTask } from "@/lib/reports/data";
import { describeAssignees } from "@/lib/tasks/assignees";
import { formatDay } from "@/lib/time";

// The report's task sections as rows of facts: who, when, what was said, and the evidence. On paper the links
// lose their colour and evidence chips print their address.

const assigneeOf = (task: ReportTask) => describeAssignees(task.assignees);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function TaskTitle({ task }: { task: ReportTask }) {
  return (
    <Link href={`/tasks/${task.id}`} prefetch={false} className="text-[13px] font-medium break-words underline-offset-4 hover:underline">
      {task.title}
    </Link>
  );
}

function EvidenceLinks({ evidence }: { evidence: ReportTask["evidence"] }) {
  if (evidence.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Evidence">
      {evidence.map((link) => (
        <li key={link.url} className="max-w-full">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={link.url}
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-xs transition-colors hover:bg-accent"
          >
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{link.label ?? hostOf(link.url)}</span>
            <span className="hidden print:inline">({link.url})</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Delivered: title, who owned it, the day it was completed, its completion summary and evidence. */
export function DeliveredList({ tasks, today }: { tasks: ReportTask[]; today: string }) {
  if (tasks.length === 0) return <PanelEmpty>Nothing was completed in this range.</PanelEmpty>;
  return (
    <ul className="divide-y">
      {tasks.map((task) => (
        <li key={task.id} className="px-4 py-3 break-inside-avoid">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <TaskTitle task={task} />
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {assigneeOf(task)} · Completed {task.completedDay ? formatDay(task.completedDay, today) : ""}
            </span>
          </div>
          {task.completionSummary ? <p className="mt-1 text-[13px] text-muted-foreground">{task.completionSummary}</p> : null}
          <EvidenceLinks evidence={task.evidence} />
        </li>
      ))}
    </ul>
  );
}

/** One open task: status, title, owner and status in words, the due date in words, and one line of detail. */
function OpenRow({ task, today, detail }: { task: ReportTask; today: string; detail: ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-4 py-2.5 break-inside-avoid">
      <StatusIcon status={task.status} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <TaskTitle task={task} />
        <p className="text-xs text-muted-foreground">
          {assigneeOf(task)} · {TASK_STATUS_LABELS[task.status]}
        </p>
        {detail}
      </div>
      <DueLabel due={task.dueDate} today={today} status={task.status} className="mt-0.5 shrink-0" />
    </li>
  );
}

/** Open commitments: open work due in the range or overdue, soonest first, with the next action. */
export function OpenList({ tasks, today }: { tasks: ReportTask[]; today: string }) {
  if (tasks.length === 0) return <PanelEmpty>No open work is due in this range, and nothing is overdue.</PanelEmpty>;
  return (
    <ul className="divide-y">
      {tasks.map((task) => (
        <OpenRow
          key={task.id}
          task={task}
          today={today}
          detail={task.nextAction ? <p className="mt-1 text-[13px] text-muted-foreground">Next: {task.nextAction}</p> : null}
        />
      ))}
    </ul>
  );
}

/** Blocked and overdue: the reason and who or what unblocks it; overdue work shows its next action instead. */
export function BlockedList({ tasks, today }: { tasks: ReportTask[]; today: string }) {
  if (tasks.length === 0) return <PanelEmpty>Nothing is blocked or overdue.</PanelEmpty>;
  return (
    <ul className="divide-y">
      {tasks.map((task) => (
        <OpenRow
          key={task.id}
          task={task}
          today={today}
          detail={
            task.status === "blocked" ? (
              <p className="mt-1 text-[13px] text-status-blocked-fg">
                {task.blockedReason ?? "Blocked"}
                {task.blockedBy ? <span className="text-muted-foreground"> · Waiting on {task.blockedBy}</span> : null}
              </p>
            ) : task.nextAction ? (
              <p className="mt-1 text-[13px] text-muted-foreground">Next: {task.nextAction}</p>
            ) : null
          }
        />
      ))}
    </ul>
  );
}
