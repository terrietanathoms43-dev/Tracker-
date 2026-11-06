import { describe, expect, it } from "vitest";
import { contributionsTable, csvCell, deliveredTable, scopeTable, toCsv } from "./csv";
import type { ReportTask } from "./data";
import { groupActiveScope } from "./scope";

describe("csvCell", () => {
  it("leaves plain text and numbers alone", () => {
    expect(csvCell("Fix nightly backup")).toBe("Fix nightly backup");
    expect(csvCell(3)).toBe("3");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes a field holding a comma, a quote or a line break, doubling inner quotes", () => {
    expect(csvCell("Billing, invoices")).toBe('"Billing, invoices"');
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("carriage\r\nreturn")).toBe('"carriage\r\nreturn"');
    expect(csvCell('"')).toBe('""""');
  });

  it("keeps a spreadsheet from running a text cell as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+1 more")).toBe("'+1 more");
    expect(csvCell("-")).toBe("'-");
    expect(csvCell("@admin")).toBe("'@admin");
    expect(csvCell(-2)).toBe("-2");
  });
});

describe("toCsv", () => {
  it("joins fields with commas and ends every record with CRLF", () => {
    expect(
      toCsv([
        ["a", "b"],
        ["c, d", 1],
      ]),
    ).toBe('a,b\r\n"c, d",1\r\n');
  });
});

const task: ReportTask = {
  id: "t1",
  title: 'Ship "v2", finally',
  status: "completed",
  priority: "normal",
  assignees: [{ id: "u1", name: "Jordan Dev", email: "jordan@trackwise.test", image: null }],
  dueDate: "2026-10-10",
  completedDay: "2026-10-12",
  createdDay: "2026-10-01",
  updatedAt: "2026-10-30T12:00:00.000Z",
  completionSummary: "Done.\nNotes in the doc.",
  nextAction: null,
  blockedReason: null,
  blockedBy: null,
  goalId: null,
  goalTitle: null,
  project: null,
  evidence: [
    { url: "https://example.com/a", label: "PR" },
    { url: "https://example.com/b", label: null },
  ],
};

describe("tables", () => {
  it("delivered: one row per task, people in one column, evidence urls space-separated", () => {
    expect(toCsv(deliveredTable([task]))).toBe(
      'Title,Assignees,Completed on,Completion summary,Evidence\r\n"Ship ""v2"", finally",Jordan Dev,2026-10-12,"Done.\nNotes in the doc.",https://example.com/a https://example.com/b\r\n',
    );
    const pair = { ...task, title: "Pair work", assignees: [...task.assignees, { id: "u2", name: "Sam Dev", email: "sam@trackwise.test", image: null }], evidence: [] };
    const nobody = { ...task, title: "Orphan", assignees: [], evidence: [] };
    expect(toCsv(deliveredTable([pair, nobody])).split("\r\n").slice(1, 3)).toEqual(['Pair work,Jordan Dev; Sam Dev,2026-10-12,"Done.\nNotes in the doc.",', 'Orphan,Unassigned,2026-10-12,"Done.\nNotes in the doc.",']);
  });

  it("contributions: counts as numbers", () => {
    const rows = contributionsTable([{ person: { id: "u1", name: "Sam Dev", email: "sam@trackwise.test", image: null }, overdue: 1, blocked: 0, open: 4, completed: 2, deltaCompleted: -1 }]);
    expect(toCsv(rows)).toBe("Person,Email,Overdue,Blocked,Open,Completed,Change vs prior\r\nSam Dev,sam@trackwise.test,1,0,4,2,-1\r\n");
  });

  it("scope: one row per task in the view's order, with its place, its dates, whether the cycle added it, and one detail", () => {
    const stuck: ReportTask = {
      ...task,
      id: "t2",
      title: "Call the clinic",
      status: "blocked",
      completedDay: null,
      completionSummary: null,
      blockedReason: "No answer",
      blockedBy: "Front desk",
      createdDay: "2026-10-30",
      project: { id: "p1", name: "Lumen Health" },
      goalTitle: "Intake live",
      evidence: [],
    };
    const scope = groupActiveScope([task, stuck], { from: "2026-10-24", to: "2026-11-06" }, "2026-11-06");
    expect(toCsv(scopeTable(scope)).split("\r\n").slice(0, 3)).toEqual([
      "Title,Project,Goal,Assignees,Status,Due date,Completed on,Added on,New this cycle,Detail",
      "Call the clinic,Lumen Health,Intake live,Jordan Dev,Blocked,2026-10-10,,2026-10-30,yes,No answer · Waiting on Front desk",
      '"Ship ""v2"", finally",,,Jordan Dev,Completed,2026-10-10,2026-10-12,2026-10-01,no,"Done.\nNotes in the doc."',
    ]);
  });
});
