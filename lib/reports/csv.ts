import { TASK_STATUS_LABELS } from "@/lib/constants";
import { nameOf } from "@/lib/tasks/people";
import { formatDue } from "@/lib/time";
import type { ContributionRow, ReportTask } from "./data";
import { addedInCycle, type ActiveScope } from "./scope";

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

// --- the four tables ----------------------------------------------------------------------------------------------

/** "Jordan Dev; Sam Dev"; "Unassigned" when nobody. The file keeps names where the page shows avatars. */
const peopleOf = (task: ReportTask) => (task.assignees.length === 0 ? "Unassigned" : task.assignees.map((person) => nameOf(person)).join("; "));

export function deliveredTable(tasks: ReportTask[]): CsvCell[][] {
  return [
    ["Title", "Assignees", "Completed on", "Completion summary", "Evidence"],
    ...tasks.map((task) => [task.title, peopleOf(task), task.completedDay, task.completionSummary, task.evidence.map((link) => link.url).join(" ")]),
  ];
}

export function openTable(tasks: ReportTask[], today: string): CsvCell[][] {
  return [
    ["Title", "Assignees", "Status", "Due date", "Due", "Next action"],
    ...tasks.map((task) => [
      task.title,
      peopleOf(task),
      TASK_STATUS_LABELS[task.status],
      task.dueDate,
      task.dueDate ? formatDue(task.dueDate, today).text : "",
      task.nextAction,
    ]),
  ];
}

export function contributionsTable(rows: ContributionRow[]): CsvCell[][] {
  return [
    ["Person", "Email", "Overdue", "Blocked", "Open", "Completed", "Change vs prior"],
    ...rows.map((row) => [nameOf(row.person, ""), row.person.email, row.overdue, row.blocked, row.open, row.completed, row.deltaCompleted ?? 0]),
  ];
}

/** What a scope row says in one column: the blocker (and who unblocks it), the next action, or the completion summary. */
const scopeDetail = (task: ReportTask): string | null => {
  if (task.status === "completed") return task.completionSummary;
  if (task.status === "blocked") return [task.blockedReason, task.blockedBy ? `Waiting on ${task.blockedBy}` : null].filter((part) => part !== null).join(" · ") || null;
  return task.nextAction;
};

/** The active scope in the view's order (lib/reports/scope.ts): one row per task, its place, its dates, and one Detail column. */
export function scopeTable(scope: ActiveScope): CsvCell[][] {
  return [
    ["Title", "Project", "Goal", "Assignees", "Status", "Due date", "Completed on", "Added on", "New this cycle", "Detail"],
    ...scope.groups.flatMap((group) =>
      group.tasks.map((task) => [
        task.title,
        task.project?.name ?? "",
        task.goalTitle ?? "",
        peopleOf(task),
        TASK_STATUS_LABELS[task.status],
        task.dueDate,
        task.completedDay,
        task.createdDay,
        addedInCycle(task, scope.range) ? "yes" : "no",
        scopeDetail(task),
      ]),
    ),
  ];
}
