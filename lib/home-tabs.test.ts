import { describe, expect, it } from "vitest";
import { decodeTabConfig, defaultTabConfig, landingTab, parseTabParam, resolveTabConfig, serializeTabConfig } from "@/lib/home-tabs";

describe("defaultTabConfig", () => {
  it("lands members and leaders on the list", () => {
    expect(landingTab(defaultTabConfig("member"))).toBe("list");
    expect(landingTab(defaultTabConfig("leader"))).toBe("list");
    expect(defaultTabConfig("member").order).toEqual(["list", "board", "projects", "home"]);
  });

  it("lands admins and stakeholders on Home", () => {
    expect(landingTab(defaultTabConfig("admin"))).toBe("home");
    expect(defaultTabConfig("admin").order[0]).toBe("home");
  });

  it("gives stakeholders only the Home tab", () => {
    expect(defaultTabConfig("stakeholder").order).toEqual(["home"]);
  });
});

describe("resolveTabConfig", () => {
  it("keeps a saved order and fills in tabs it does not mention", () => {
    const config = resolveTabConfig({ order: ["projects", "list"] }, "member");
    expect(config.order).toEqual(["projects", "list", "board", "home"]);
  });

  it("drops tabs the role may not see", () => {
    const config = resolveTabConfig({ order: ["list", "board", "home"] }, "stakeholder");
    expect(config).toEqual({ order: ["home"] });
  });

  it("lands on the first tab, even a stale saved landing", () => {
    const config = resolveTabConfig({ order: ["board", "list"], landing: "home" }, "member");
    expect(landingTab(config)).toBe("board");
  });
});

describe("parseTabParam", () => {
  it("reads view values as tabs", () => {
    expect(parseTabParam("")).toBeNull();
    expect(parseTabParam("list")).toBe("list");
    expect(parseTabParam("board")).toBe("board");
    expect(parseTabParam("projects")).toBe("projects");
    expect(parseTabParam("home")).toBe("home");
    expect(parseTabParam("nonsense")).toBeNull();
  });
});

describe("decodeTabConfig", () => {
  it("falls back to the role default on missing or broken cookies", () => {
    expect(decodeTabConfig(undefined, "member")).toEqual(defaultTabConfig("member"));
    expect(decodeTabConfig("{not json", "member")).toEqual(defaultTabConfig("member"));
  });

  it("round-trips a config, ignoring removed fields", () => {
    const order = ["board", "list", "projects", "home"] as const;
    const config = decodeTabConfig(serializeTabConfig({ order: [...order] }), "member");
    expect(config).toEqual({ order: [...order] });
    expect(landingTab(config)).toBe("board");
  });
});
