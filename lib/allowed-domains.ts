import { isTestEmail } from "@/lib/test-mode";

// Who may have an account at all: with ALLOWED_EMAIL_DOMAINS=intellibus.com only that company's addresses can
// sign in or be invited. Unset means anyone. Test personas are exempt outside production so the seeded flows
// keep working.

/** The configured domains, lowercased, without a leading "@". */
export function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isAllowedEmail(email: string, domains: string[] = allowedEmailDomains()): boolean {
  if (domains.length === 0) return true;
  const normalized = email.trim().toLowerCase();
  if (process.env.NODE_ENV !== "production" && isTestEmail(normalized)) return true;
  const at = normalized.lastIndexOf("@");
  if (at === -1) return false;
  const domain = normalized.slice(at + 1);
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

/** "@intellibus.com" or "@intellibus.com or @example.org": for the login page and error messages. */
export function allowedDomainsLabel(domains: string[] = allowedEmailDomains()): string | null {
  if (domains.length === 0) return null;
  const labels = domains.map((domain) => `@${domain}`);
  return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}
