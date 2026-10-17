import { log } from "@/lib/log";
import { isTestEmail } from "@/lib/test-mode";
import { smtpConfigured } from "./config";
import { consoleProvider } from "./console";
import { nodemailerProvider } from "./nodemailer";
import type { MailMessage, MailProvider } from "./provider";

export type { MailMessage, MailProvider } from "./provider";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Which provider (if any) delivers this message. A .test address is a reserved domain that can never
 * receive mail: in development it goes to the console (so a magic link can still be followed), in
 * production it is dropped.
 */
export function providerFor(to: string): MailProvider | null {
  if (isTestEmail(to)) return isDev ? consoleProvider : null;
  if (!smtpConfigured) return isDev ? consoleProvider : null;
  return nodemailerProvider;
}

/** Sends one email. Throws when delivery fails so the caller can tell the user. */
export async function sendMail(message: MailMessage): Promise<void> {
  const provider = providerFor(message.to);
  if (provider === null) {
    log.warn("mail.skipped", { to: message.to, subject: message.subject, reason: isTestEmail(message.to) ? "test address" : "smtp not configured" });
    return;
  }
  await provider.send(message);
  log.info("mail.sent", { provider: provider.name, to: message.to, subject: message.subject });
}
