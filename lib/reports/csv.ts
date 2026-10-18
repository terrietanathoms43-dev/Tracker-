import { TASK_STATUS_LABELS } from "@/lib/constants";
import { nameOf } from "@/lib/tasks/people";
import { formatDue } from "@/lib/time";
import type { ContributionRow, ReportTask, TeamReportRow } from "./data";

// The report's tables as CSV (RFC 4180): comma-separated, CRLF line ends, a field quoted when it holds a quote,
// a comma or a line break, and quotes inside doubled. Pure, so the quoting rules are unit-tested.

export type CsvCell = string | number | null | undefined;

/**
 * Spreadsheet apps run a cell that starts with = + - or @ as a formula, so a task titled "=HYPERLINK(…)" could
 * act when the file is opened. Text cells that start that way get a leading apostrophe, which spreadsheets
 * hide and treat as "this is text". Numbers are written as they are.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One field, quoted only when it has to be. */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A whole file: the header row first, every record ending in CRLF. */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(csvCell).join(",") + "\r\n").join("");
}

// --- the four tables ---------------------------------------------------------------------------------------------

/** "Jordan Dev; Sam Dev" (people) and "Frontend; Platform" (teams), each in its own column; "Unassigned" when nobody. */
const peopleOf = (task: ReportTask) => (task.assignees.people.length === 0 && task.assignees.teams.length === 0 ? "Unassigned" : task.assignees.people.map((person) => nameOf(person)).join("; "));
const teamsOf = (task: ReportTask) => task.assignees.teams.map((team) => team.name).join("; ");

export function deliveredTable(tasks: ReportTask[]): CsvCell[][] {
  return [
    ["Title", "Assignees", "Teams", "Completed on", "Completion summary", "Evidence"],
    ...tasks.map((task) => [task.title, peopleOf(task), teamsOf(task), task.completedDay, task.completionSummary, task.evidence.map((link) => link.url).join(" ")]),
  ];
}

export function openTable(tasks: ReportTask[], today: string): CsvCell[][] {
  return [
    ["Title", "Assignees", "Teams", "Status", "Due date", "Due", "Next action"],
    ...tasks.map((task) => [
      task.title,
      peopleOf(task),
      teamsOf(task),
      TASK_STATUS_LABELS[task.status],
      task.dueDate,
      task.dueDate ? formatDue(task.dueDate, today).text : "",
      task.nextAction,
    ]),
  ];
}

export function contributionsTable(rows: ContributionRow[]): CsvCell[][] {
  return [
    ["Person", "Email", "Completed", "Progress updates", "Blockers raised"],
    ...rows.map((row) => [nameOf(row.person, ""), row.person.email, row.completed, row.progressUpdates, row.blockersRaised]),
  ];
}

export function teamsTable(rows: TeamReportRow[]): CsvCell[][] {
  return [["Team", "Members", "Completed", "Open", "Blocked", "Overdue"], ...rows.map((row) => [row.team.name, row.members, row.completed, row.open, row.blocked, row.overdue])];
}
