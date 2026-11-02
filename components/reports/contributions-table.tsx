"use client";

import { cn } from "cn";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { PanelEmpty } from "@/components/dashboard/panel";
import { UserAvatar } from "@/components/user-avatar";
import type { ContributionRow } from "@/lib/reports/data";
import { gradeColor, gradeShare, nextSort, sortRows, type SortDirection } from "@/lib/reports/grade";
import { nameOf } from "@/lib/tasks/people";

// People, negative first (docs/PLAN.md, 2026-11-01 log): what is overdue or blocked on each person now, whether
// they have anything open at all (Idle when not), then what they completed in the range and the change against the
// range before. Opens sorted worst first; every header sorts on click, like a file list. Each person is their
// avatar circle (the name on hover and for screen readers). Counts, not a ranking.

type Key = "person" | "overdue" | "blocked" | "open" | "completed" | "deltaCompleted";

const COLUMNS: { key: Exclude<Key, "person">; short: string; long: string }[] = [
  { key: "overdue", short: "Overdue", long: "Overdue" },
  { key: "blocked", short: "Blocked", long: "Blocked" },
  { key: "open", short: "Open", long: "Open now" },
  { key: "completed", short: "Done", long: "Completed" },
  { key: "deltaCompleted", short: "Δ Prior", long: "Change vs prior" },
];

const valueOf = (row: ContributionRow, key: Key): number | string => (key === "person" ? nameOf(row.person, row.person.email ?? "") : (row[key] ?? 0));

function Cell({ row, column, maxCompleted }: { row: ContributionRow; column: Exclude<Key, "person">; maxCompleted: number }) {
  const value = row[column] ?? 0;
  if (column === "overdue" || column === "blocked") {
    return value > 0 ? <span className="font-semibold text-status-blocked-fg">{value}</span> : <span className="text-muted-foreground">0</span>;
  }
  if (column === "open") {
    return value === 0 ? (
      <span className="inline-flex items-center rounded-md bg-status-awaiting-bg px-1.5 py-0.5 text-[12px] font-medium text-status-awaiting-fg" title="Nothing open: this person has no task assigned">
        Idle
      </span>
    ) : (
      <>{value}</>
    );
  }
  if (column === "completed") {
    return (
      <span className="font-semibold" style={{ color: gradeColor(gradeShare(value, maxCompleted)) }}>
        {value}
      </span>
    );
  }
  if (value > 0) return <span className="font-semibold text-status-completed-fg">+{value}</span>;
  if (value < 0) return <span className="font-semibold text-status-blocked-fg">{value}</span>;
  return <span className="text-muted-foreground">0</span>;
}

export function ContributionsTable({ rows }: { rows: ContributionRow[] }) {
  // Worst first by default: the rows arrive ordered overdue → blocked → idle → name, and "overdue, high to low" keeps that.
  const [sort, setSort] = useState<{ key: Key; direction: SortDirection }>({ key: "overdue", direction: "desc" });
  if (rows.length === 0) return <PanelEmpty>Nobody in the workspace does work yet.</PanelEmpty>;
  const maxCompleted = Math.max(0, ...rows.map((row) => row.completed));
  const sorted = sortRows(rows, (row) => valueOf(row, sort.key), sort.direction);
  const sortBy = (key: Key) => setSort((current) => nextSort(current, key, key === "person" ? "asc" : "desc"));
  const trouble = rows.filter((row) => row.overdue > 0 || row.blocked > 0).length;
  const idle = rows.filter((row) => row.open === 0).length;

  const header = (key: Key, label: { short: string; long: string }, align: "left" | "right") => {
    const on = sort.key === key;
    const Icon = on ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={on ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
        className={cn("px-2 py-1 font-medium first:pl-2 last:pr-2", align === "left" ? "text-left" : "text-right")}
      >
        <button
          type="button"
          onClick={() => sortBy(key)}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md px-2 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            on && "text-foreground",
          )}
          title={`Sort by ${label.long.toLowerCase()}`}
        >
          <span className="sm:hidden">{label.short}</span>
          <span className="hidden sm:inline">{label.long}</span>
          <Icon className={cn("size-3.5", on ? "text-primary" : "text-muted-foreground/60")} aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <>
      <p className={cn("border-b px-4 py-2 text-[13px]", trouble > 0 || idle > 0 ? "text-foreground" : "text-muted-foreground")}>
        {trouble === 0 && idle === 0
          ? "Nobody is behind, nobody is blocked, everyone has work."
          : [trouble > 0 ? `${trouble} ${trouble === 1 ? "person has" : "people have"} overdue or blocked work` : null, idle > 0 ? `${idle} ${idle === 1 ? "person has" : "people have"} nothing open` : null]
              .filter(Boolean)
              .join(" · ")}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[13px] text-muted-foreground">
            {header("person", { short: "Person", long: "Person" }, "left")}
            {COLUMNS.map((column) => header(column.key, column, "right"))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((row) => (
            <tr key={row.person.id} className="break-inside-avoid">
              <th scope="row" className="px-4 py-2 text-left font-medium">
                <span className="inline-flex items-center" title={nameOf(row.person)}>
                  <UserAvatar name={row.person.name} email={row.person.email} image={row.person.image} size="sm" className="print:hidden" />
                  {/* The name is for screen readers and for paper, where there is no hover. */}
                  <span className="sr-only print:not-sr-only print:ml-2">{nameOf(row.person)}</span>
                </span>
              </th>
              {COLUMNS.map((column) => (
                <td key={column.key} className="px-4 py-2 text-right tabular-nums">
                  <Cell row={row} column={column.key} maxCompleted={maxCompleted} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t px-4 py-3 text-[13px] text-muted-foreground">
        Overdue and Blocked are as of today and turn red above zero; Idle means nothing is assigned. Completed is shaded from red (none) to green (the most in the
        column). Counts of what was recorded, not a ranking: one large delivery can matter more than many small ones. Hover an avatar for the name.
      </p>
    </>
  );
}
