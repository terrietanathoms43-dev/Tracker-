import { cn } from "cn";
import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { StatusIcon } from "@/components/status-badge";
import { DueLabel } from "@/components/tasks/due-label";
import { UserAvatar } from "@/components/user-avatar";
import { tasksHref } from "@/lib/tasks/filters";
import { nameOf } from "@/lib/tasks/people";
import type { Person, WorkloadRow } from "@/lib/tasks/types";
import { PanelEmpty } from "./panel";

// Who holds what: one row per worker with their open tasks, and an Unassigned row last (lib/dal/tasks.ts workload).

/** How many titles a row lists when opened before pointing at the full list. */
const TITLES_SHOWN = 8;

function PersonMark({ person }: { person: Person | null }) {
  if (person === null) return <span className="size-6 shrink-0 rounded-full border border-dashed" aria-hidden />;
  return <UserAvatar name={person.name} email={person.email} image={person.image} size="sm" />;
}

/** "1 blocked · 2 overdue" in the status colour; nothing when there is no trouble. */
function TroubleCounts({ row, className }: { row: WorkloadRow; className?: string }) {
  if (row.blocked + row.overdue === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-x-2 text-[11px] font-medium text-status-blocked-fg tabular-nums", className)}>
      {row.blocked > 0 ? <span>{row.blocked} blocked</span> : null}
      {row.overdue > 0 ? <span>{row.overdue} overdue</span> : null}
    </span>
  );
}

const assigneeFilter = (row: WorkloadRow) => tasksHref({ assignee: row.person?.id ?? "none" });

/**
 * The Team page's workload: each row opens (a native disclosure, so it works by touch and keyboard) to list the
 * person's open tasks, most pressing first, with a link to all of them in Tasks.
 */
export function Workload({ rows, today }: { rows: WorkloadRow[]; today: string }) {
  if (rows.length === 0) return <PanelEmpty>Nobody in the workspace does work yet.</PanelEmpty>;
  return (
    <ul className="divide-y">
      {rows.map((row) => {
        const name = nameOf(row.person, "Unassigned");
        const summary = (
          <>
            <PersonMark person={row.person} />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-[13px] font-medium", row.person === null && "text-muted-foreground")}>{name}</span>
              <TroubleCounts row={row} className="mt-0.5" />
            </span>
            <span className={cn("shrink-0 text-xs tabular-nums", row.active.length === 0 ? "text-muted-foreground" : "font-medium")}>{row.active.length} active</span>
          </>
        );
        if (row.active.length === 0) {
          return (
            <li key={row.person?.id ?? "unassigned"} className="flex items-center gap-3 px-4 py-2.5">
              {summary}
              <span className="size-4 shrink-0" aria-hidden />
            </li>
          );
        }
        return (
          <li key={row.person?.id ?? "unassigned"}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60 [&::-webkit-details-marker]:hidden">
                {summary}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="pb-1" aria-label={`${name}'s open tasks`}>
                {row.active.slice(0, TITLES_SHOWN).map((task) => (
                  <li key={task.id}>
                    <Link href={`/tasks/${task.id}`} prefetch={false} className="flex items-center gap-2.5 py-1.5 pr-4 pl-13 transition-colors hover:bg-accent/60">
                      <StatusIcon status={task.status} className="size-3.5" />
                      <span className="min-w-0 flex-1 truncate text-xs">{task.title}</span>
                      <DueLabel due={task.dueDate} today={today} status={task.status} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={assigneeFilter(row)}
                className="flex items-center gap-1 pr-4 pb-2.5 pl-13 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {row.person === null ? "All unassigned work in Tasks" : `All ${row.active.length} in Tasks`}
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/** Home's short version: name, open count and trouble, each row a link to the Team page. */
export function WorkloadCompact({ rows }: { rows: WorkloadRow[] }) {
  if (rows.length === 0) return <PanelEmpty>Nobody in the workspace does work yet.</PanelEmpty>;
  return (
    <ul className="divide-y">
      {rows.map((row) => (
        <li key={row.person?.id ?? "unassigned"}>
          <Link
            href={row.person === null ? assigneeFilter(row) : "/team"}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60"
            title={row.active.map((task) => task.title).join("\n") || undefined}
          >
            <PersonMark person={row.person} />
            <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", row.person === null && "text-muted-foreground")}>{nameOf(row.person, "Unassigned")}</span>
            <TroubleCounts row={row} className="shrink-0" />
            <span className={cn("w-16 shrink-0 text-right text-xs tabular-nums", row.active.length === 0 ? "text-muted-foreground" : "font-medium")}>{row.active.length} active</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
