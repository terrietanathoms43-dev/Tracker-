import { describe, expect, it } from "vitest";
import { titleFromComment } from "./comment-tasks";
import { TITLE_SNIPPET_MAX, titleCoversText, titleFromText } from "./title-from";

// The title a task gets from the text typed into the add bar (docs/PLAN.md, 2026-11-11 log).

describe("titleFromText", () => {
  it("keeps a short line as it was typed", () => {
    expect(titleFromText("Fix the login bug")).toBe("Fix the login bug");
    expect(titleFromText("  Fix   the login bug  ")).toBe("Fix the login bug");
  });

  it("drops a closing full stop, but not a question mark or an ellipsis", () => {
    expect(titleFromText("Fix the login bug.")).toBe("Fix the login bug");
    expect(titleFromText("Why does login fail?")).toBe("Why does login fail?");
    expect(titleFromText("Still thinking...")).toBe("Still thinking...");
  });

  it("reads the first line that says anything", () => {
    expect(titleFromText("\n\n  \nCall the vendor\nThey owe us a quote for the new racks.")).toBe("Call the vendor");
  });

  it("takes a list marker, a checkbox or a heading mark off the front", () => {
    expect(titleFromText("- Renew the certificate")).toBe("Renew the certificate");
    expect(titleFromText("1. Renew the certificate")).toBe("Renew the certificate");
    expect(titleFromText("[ ] Renew the certificate")).toBe("Renew the certificate");
    expect(titleFromText("## Renew the certificate")).toBe("Renew the certificate");
  });

  it("uses the first sentence of a long line", () => {
    const text = "Move the nightly export to the new bucket. The old one is deleted at the end of the month and finance still reads from it every morning.";
    expect(titleFromText(text)).toBe("Move the nightly export to the new bucket");
  });

  it("does not stop at a sentence too short to name a task", () => {
    const text = "Hi. The nightly export has to move to the new bucket before the old one is deleted at the end of the month";
    const title = titleFromText(text);
    expect(title.startsWith("Hi. The nightly export")).toBe(true);
    expect(title.endsWith("…")).toBe(true);
  });

  it("cuts a long line without a sentence end at a word, with an ellipsis", () => {
    const text = "Move the nightly export to the new bucket before the old one is deleted at the end of the month because finance reads it";
    const title = titleFromText(text);
    expect(title.length).toBeLessThanOrEqual(TITLE_SNIPPET_MAX);
    expect(title.endsWith("…")).toBe(true);
    expect(text.startsWith(title.slice(0, -1))).toBe(true);
    // The cut is between words: the text carries on with a space.
    expect(text[title.length - 1]).toBe(" ");
  });

  it("cuts one endless word at the cap", () => {
    const title = titleFromText("x".repeat(300));
    expect(title).toBe(`${"x".repeat(TITLE_SNIPPET_MAX - 1)}…`);
  });

  it("gives nothing for nothing", () => {
    expect(titleFromText("")).toBe("");
    expect(titleFromText("  \n \n")).toBe("");
    expect(titleFromText("- ")).toBe("");
  });

  it("honours a smaller cap", () => {
    expect(titleFromText("Move the nightly export to the new bucket", 20)).toBe("Move the nightly…");
  });
});

describe("titleCoversText", () => {
  it("is true for one short line", () => {
    expect(titleCoversText("Fix the login bug")).toBe(true);
    expect(titleCoversText("\nFix the login bug\n")).toBe(true);
  });

  it("is false once there is more to read", () => {
    expect(titleCoversText("Fix the login bug\nIt fails for Google accounts.")).toBe(false);
    expect(titleCoversText("x".repeat(TITLE_SNIPPET_MAX + 1))).toBe(false);
  });
});

describe("titleFromComment", () => {
  it("makes a comment's first line that says something its title, cut to the cap", () => {
    expect(titleFromComment("\n  \nThe export drops the last row\nmore detail", 200)).toBe("The export drops the last row");
    expect(titleFromComment("abcdefghij", 5)).toBe("abcd…");
    expect(titleFromComment("", 200)).toBe("");
  });
});
