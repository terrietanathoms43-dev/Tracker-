import { describe, expect, it } from "vitest";
import { contributionsTable, csvCell, deliveredTable, toCsv } from "./csv";
import type { ReportTask } from "./data";

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
  completionSummary: "Done.\nNotes in the doc.",
  nextAction: null,
  blockedReason: null,
  blockedBy: null,
  goalId: null,
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
    const rows = contributionsTable([{ person: { id: "u1", name: "Sam Dev", email: "sam@trackwise.test", image: null }, completed: 2, progressUpdates: 5, blockersRaised: 0 }]);
    expect(toCsv(rows)).toBe("Person,Email,Completed,Progress updates,Blockers raised\r\nSam Dev,sam@trackwise.test,2,5,0\r\n");
  });
});
