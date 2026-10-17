import { describe, expect, it } from "vitest";
import { safePath } from "./safe-path";

describe("safePath", () => {
  it("keeps same-site paths", () => {
    expect(safePath("/settings/organization")).toBe("/settings/organization");
    expect(safePath("/invite/abc?x=1")).toBe("/invite/abc?x=1");
  });

  it("refuses anything that leaves the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "evil", "", "/\nevil"]) {
      expect(safePath(bad)).toBe("/home");
    }
  });

  it("falls back for non-strings", () => {
    expect(safePath(undefined)).toBe("/home");
    expect(safePath(["/a", "/b"], "/home")).toBe("/home");
  });
});
