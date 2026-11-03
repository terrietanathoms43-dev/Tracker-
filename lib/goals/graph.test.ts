import { describe, expect, it } from "vitest";
import { layoutGraph, wouldCycle } from "./graph";

const node = (id: string, parentId: string | null = null) => ({ id, parentId });

describe("wouldCycle", () => {
  const edges = [
    { from: "design", to: "code" },
    { from: "code", to: "secure" },
  ];
  it("refuses a loop back to an earlier goal", () => {
    expect(wouldCycle(edges, "secure", "design")).toBe(true);
    expect(wouldCycle(edges, "code", "code")).toBe(true);
  });
  it("allows a link that only goes forward or sideways", () => {
    expect(wouldCycle(edges, "secure", "scale")).toBe(false);
    expect(wouldCycle(edges, "design", "secure")).toBe(false);
  });
});

describe("layoutGraph", () => {
  it("lays a chain out left to right", () => {
    const layout = layoutGraph([node("design"), node("code"), node("secure")], [
      { from: "design", to: "code" },
      { from: "code", to: "secure" },
    ]);
    expect(layout.columns).toEqual([["design"], ["code"], ["secure"]]);
  });
  it("puts a goal one column after the last thing leading into it", () => {
    const layout = layoutGraph([node("a"), node("b"), node("c")], [
      { from: "a", to: "c" },
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
    expect(layout.positions.get("c")).toEqual({ column: 2, row: 0 });
  });
  it("hangs a sub-goal next to its parent", () => {
    const layout = layoutGraph([node("parent"), node("other"), node("child", "parent")], []);
    expect(layout.columns[0]).toEqual(["parent", "other"]);
    expect(layout.positions.get("child")).toEqual({ column: 1, row: 0 });
  });
  it("keeps the given order for unconnected goals and survives a loop", () => {
    const layout = layoutGraph([node("x"), node("y")], [
      { from: "x", to: "y" },
      { from: "y", to: "x" },
    ]);
    expect(layout.columns.flat().sort()).toEqual(["x", "y"]);
  });
});
