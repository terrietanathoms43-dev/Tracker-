// The quick-add bar's typed shortcuts: priorities, due words and @mentions read out of a title.
import { describe, expect, it } from "vitest";
import { activeToken, mentionTargets, parseQuickAdd, removeTokens, suggest } from "./quick-add";

const jordan = { id: "j", name: "Jordan Dev", email: "jordan@x.test", image: null };
const sam = { id: "s", name: "Sam Dev", email: "sam@x.test", image: null };
const samOther = { id: "s2", name: "Sam Ops", email: "sops@x.test", image: null };
const noName = { id: "n", name: null, email: "riley@x.test", image: null };
const today = { id: "t", name: "Today Person", email: "tp@x.test", image: null };
const frontend = { id: "f", name: "Frontend" };
const platform = { id: "p", name: "Core Platform" };

const targets = mentionTargets([jordan, sam, noName, today], [frontend, platform]);

describe("mentionTargets", () => {
  it("gives everyone the shortest spelling no one else shares", () => {
    expect(targets.map((target) => [target.id, target.handle])).toEqual([
      ["j", "jordan"],
      ["s", "sam"],
      ["n", "riley"],
      ["t", "todayperson"],
      ["f", "frontend"],
      ["p", "coreplatform"],
    ]);
  });

  it("falls back to the full name when a first name is shared", () => {
    const both = mentionTargets([sam, samOther], []);
    expect(both.map((target) => target.handle)).toEqual(["samdev", "samops"]);
  });
});

describe("parseQuickAdd", () => {
  it("takes the shortcuts out of the title", () => {
    const parsed = parseQuickAdd("Fix the login bug !high @tomorrow @sam", targets);
    expect(parsed).toMatchObject({ title: "Fix the login bug", priority: "high", due: "tomorrow", people: ["s"], teams: [], unmatched: [] });
  });

  it("assigns people and teams by any of their spellings, once each", () => {
    const parsed = parseQuickAdd("@JordanDev @jordan @riley @frontend, ship it", targets);
    expect(parsed).toMatchObject({ title: "ship it", people: ["j", "n"], teams: ["f"] });
  });

  it("accepts medium for normal and lets the last priority win", () => {
    expect(parseQuickAdd("A !low !medium", targets).priority).toBe("normal");
    expect(parseQuickAdd("A !urgent @today", targets)).toMatchObject({ priority: "urgent", due: "today" });
  });

  it("leaves unknown or ambiguous words where they are", () => {
    const parsed = parseQuickAdd("Ask @ops about it! !soon", targets);
    expect(parsed).toMatchObject({ title: "Ask @ops about it! !soon", priority: null, unmatched: ["@ops"] });
    const shared = parseQuickAdd("Ping @sam", mentionTargets([sam, samOther], []));
    expect(shared).toMatchObject({ title: "Ping @sam", people: [], unmatched: ["@sam"] });
  });

  it("never reads an email or a word with a ! inside as a token", () => {
    expect(parseQuickAdd("Mail sam@x.test now!high", targets)).toMatchObject({ title: "Mail sam@x.test now!high", people: [], priority: null });
  });

  it("treats @today as the date even with someone called Today", () => {
    expect(parseQuickAdd("Call @today", targets)).toMatchObject({ title: "Call", due: "today", people: [] });
  });
});

describe("removeTokens", () => {
  it("drops the chosen tokens and tidies spaces", () => {
    const parsed = parseQuickAdd("Write  notes !high for @sam", targets);
    expect(removeTokens("Write  notes !high for @sam", parsed.tokens.filter((token) => token.kind === "priority"))).toBe("Write notes for @sam");
  });
});

describe("activeToken and suggest", () => {
  it("finds the token under the caret", () => {
    expect(activeToken("Fix it @sa", 10)).toEqual({ symbol: "@", query: "sa", start: 7, end: 10 });
    expect(activeToken("Fix it @sa now", 9)).toEqual({ symbol: "@", query: "sa", start: 7, end: 10 });
    expect(activeToken("Fix it now", 10)).toBeNull();
    expect(activeToken("sam@x", 5)).toBeNull();
  });

  it("offers due words, then people, then teams", () => {
    expect(suggest({ symbol: "@", query: "" }, targets).map((each) => each.insert)).toEqual(["@today", "@tomorrow", "@jordan", "@sam", "@riley", "@todayperson"]);
    expect(suggest({ symbol: "@", query: "plat" }, targets).map((each) => each.insert)).toEqual(["@coreplatform"]);
    expect(suggest({ symbol: "@", query: "dev" }, targets).map((each) => each.label)).toEqual(["Jordan Dev", "Sam Dev"]);
    expect(suggest({ symbol: "!", query: "h" }, targets).map((each) => each.insert)).toEqual(["!high"]);
    expect(suggest({ symbol: "!", query: "med" }, targets).map((each) => each.insert)).toEqual(["!normal"]);
  });
});
