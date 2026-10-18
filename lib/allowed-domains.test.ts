import { describe, expect, it } from "vitest";
import { allowedDomainsLabel, isAllowedEmail } from "./allowed-domains";

describe("allowed email domains", () => {
  it("lets anyone in when nothing is configured", () => {
    expect(isAllowedEmail("someone@gmail.com", [])).toBe(true);
  });

  it("keeps sign-in to the configured company, subdomains included, case-insensitively", () => {
    const domains = ["intellibus.com"];
    expect(isAllowedEmail("Avery@Intellibus.com", domains)).toBe(true);
    expect(isAllowedEmail("avery@eu.intellibus.com", domains)).toBe(true);
    expect(isAllowedEmail("avery@intellibus.com.evil.io", domains)).toBe(false);
    expect(isAllowedEmail("avery@gmail.com", domains)).toBe(false);
    expect(isAllowedEmail("not-an-email", domains)).toBe(false);
  });

  it("exempts the seeded test personas outside production", () => {
    expect(isAllowedEmail("jordan@trackwise.test", ["intellibus.com"])).toBe(true);
  });

  it("phrases the rule for people", () => {
    expect(allowedDomainsLabel([])).toBeNull();
    expect(allowedDomainsLabel(["intellibus.com"])).toBe("@intellibus.com");
    expect(allowedDomainsLabel(["intellibus.com", "example.org"])).toBe("@intellibus.com or @example.org");
  });
});
