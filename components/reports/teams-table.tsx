import { cn } from "cn";
import Link from "next/link";
import { PanelEmpty } from "@/components/team/panel";
import type { TeamReportRow } from "@/lib/reports/data";

// Per team: what it delivered in the range and what it holds today. Counts of recorded tasks, listed by name.

const COLUMNS: { key: keyof Omit<TeamReportRow, "team">; short: string; long: string; problem?: boolean }[] = [
  { key: "members", short: "People", long: "Members" },
  { key: "completed", short: "Done", long: "Completed" },
  { key: "open", short: "Open", long: "Open now" },
  { key: "blocked", short: "Blocked", long: "Blocked now", problem: true },
  { key: "overdue", short: "Overdue", long: "Overdue now", problem: true },
];

export function TeamsTable({ rows }: { rows: TeamReportRow[] }) {
  if (rows.length === 0) return <PanelEmpty>No teams yet. Teams are made on the Members page and can be assigned work.</PanelEmpty>;
  return (
    <>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Team
            </th>
            {COLUMNS.map((column) => (
              <th key={column.key} scope="col" className="px-2 py-2 text-right font-medium last:pr-4">
                <span className="sm:hidden">{column.short}</span>
                <span className="hidden sm:inline">{column.long}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.team.id} className="break-inside-avoid">
              <th scope="row" className="px-4 py-2.5 text-left font-medium">
                <Link href={`/teams/${row.team.id}`} prefetch={false} className="underline-offset-4 hover:underline">
                  {row.team.name}
                </Link>
              </th>
              {COLUMNS.map((column) => (
                <td key={column.key} className={cn("px-2 py-2.5 text-right tabular-nums last:pr-4", column.problem && row[column.key] > 0 && "font-medium text-status-blocked-fg")}>
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">Completed counts the range; open, blocked and overdue are as of today. Work assigned to a team counts for the team, not for each member.</p>
    </>
  );
}
