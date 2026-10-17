import { log } from "@/lib/log";
import type { MailMessage, MailProvider } from "./provider";

/** Development stand-in: the email (including any sign-in or invite link) goes to the server log. */
export const consoleProvider: MailProvider = {
  name: "console",
  async send(message: MailMessage) {
    log.info("mail.console", { to: message.to, subject: message.subject, text: message.text });
  },
};
