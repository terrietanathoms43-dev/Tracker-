import { describe, expect, it } from "vitest";
import { cappedText, optionalLink, optionalText, requiredLink, requiredText, sanitizeText } from "./sanitize";

describe("sanitizeText", () => {
  it("keeps ordinary text, newlines and tabs", () => {
    expect(sanitizeText("Ship it\nnext\ttab  now")).toBe("Ship it\nnext\ttab  now");
  });

  it("strips null bytes and other control characters", () => {
    expect(sanitizeText("ab\u0000c\u0007d\u000Be\u007Ff")).toBe("abcdef");
  });
});

describe("cappedText", () => {
  it("trims, sanitizes and caps", () => {
    const schema = cappedText(5);
    expect(schema.parse("  abc  ")).toBe("abc");
    expect(schema.parse("a\u0000b")).toBe("ab");
    expect(schema.safeParse("abcdef").success).toBe(false);
  });

  it("allows empty", () => {
    expect(cappedText(5).parse("")).toBe("");
  });
});

describe("optionalText", () => {
  it("defaults to empty when absent", () => {
    expect(optionalText(10).parse(undefined)).toBe("");
  });
});

describe("requiredLink", () => {
  it("accepts http and https links", () => {
    expect(requiredLink().parse("https://example.com/doc")).toBe("https://example.com/doc");
    expect(requiredLink().parse("http://internal.local/page?q=1")).toBe("http://internal.local/page?q=1");
  });

  it("rejects other protocols, javascript: and empty", () => {
    expect(requiredLink().safeParse("ftp://files.example.com/x").success).toBe(false);
    expect(requiredLink().safeParse("javascript:alert(1)").success).toBe(false);
    expect(requiredLink().safeParse("data:text/html,<script>").success).toBe(false);
    expect(requiredLink().safeParse("").success).toBe(false);
  });

  it("rejects a link longer than the cap before it can be stored", () => {
    expect(requiredLink().safeParse(`https://example.com/${"a".repeat(2048)}`).success).toBe(false);
    expect(requiredLink().safeParse(`https://example.com/${"a".repeat(2030)}`).success).toBe(false);
  });
});

describe("optionalLink", () => {
  it("treats empty and missing as no link", () => {
    expect(optionalLink().parse("")).toBe("");
    expect(optionalLink().parse(undefined)).toBe("");
  });
});

describe("requiredText", () => {
  it("enforces the minimum and the cap", () => {
    const schema = requiredText(2, 4, "Too short.", "Too long.");
    expect(schema.parse(" ab ")).toBe("ab");
    expect(schema.safeParse("a").success).toBe(false);
    expect(schema.safeParse("abcde").success).toBe(false);
  });
});
