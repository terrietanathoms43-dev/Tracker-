import { PanelEmpty } from "@/components/team/panel";
import { UserAvatar } from "@/components/user-avatar";
import type { ContributionRow } from "@/lib/reports/data";
import { nameOf } from "@/lib/tasks/people";

// Contributions per worker: three counts each, alphabetical, with the note that they are records, not a ranking.

const COLUMNS: { key: keyof Omit<ContributionRow, "person">; short: string; long: string }[] = [
  { key: "completed", short: "Completed", long: "Completed" },
  { key: "progressUpdates", short: "Updates", long: "Progress updates" },
  { key: "blockersRaised", short: "Blockers", long: "Blockers raised" },
];

export function ContributionsTable({ rows }: { rows: ContributionRow[] }) {
  if (rows.length === 0) return <PanelEmpty>Nobody in the workspace does work yet.</PanelEmpty>;
  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[13px] text-muted-foreground">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Person
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
            <tr key={row.person.id} className="break-inside-avoid">
              <th scope="row" className="px-4 py-2.5 text-left font-medium">
                <span className="flex min-w-0 items-center gap-2">
                  <UserAvatar name={row.person.name} email={row.person.email} image={row.person.image} size="sm" className="print:hidden" />
                  <span className="truncate">{nameOf(row.person)}</span>
                </span>
              </th>
              {COLUMNS.map((column) => (
                <td key={column.key} className="px-2 py-2.5 text-right tabular-nums last:pr-4">
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t px-4 py-3 text-[13px] text-muted-foreground">
        Counts of what was recorded, listed alphabetically. They are not a comparison or a ranking: one large delivery can matter more than many small ones.
      </p>
    </>
  );
}
