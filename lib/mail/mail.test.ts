import { describe, expect, it } from "vitest";
import { providerFor } from "./index";
import { invitationEmail, magicLinkEmail, notificationEmail } from "./templates";

describe("mail routing", () => {
  it("never hands a .test address to SMTP", () => {
    const provider = providerFor("someone@trackwise.test");
    expect(provider === null || provider.name === "console").toBe(true);
  });
});

describe("templates", () => {
  it("always carry a plain-text body with the link", () => {
    const url = "https://trackwise.example/invite/abc123";
    for (const message of [
      magicLinkEmail({ to: "a@b.co", url }),
      notificationEmail({ to: "a@b.co", title: "Approval needed: Rotate keys", body: null, url }),
      invitationEmail({ to: "a@b.co", url, orgName: "Acme", inviterName: "Avery", roleLabel: "member" }),
    ]) {
      expect(message.text).toContain(url);
      expect(message.html).toContain(url);
      expect(message.subject.length).toBeGreaterThan(0);
    }
  });

  it("escapes user-supplied text in HTML", () => {
    const message = invitationEmail({ to: "a@b.co", url: "https://x.y/i/t", orgName: "<script>", inviterName: "Avery", roleLabel: "member" });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });
});
