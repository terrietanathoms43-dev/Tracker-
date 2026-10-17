import nodemailer, { type Transporter } from "nodemailer";
import { mailFrom, smtpConfig } from "./config";
import type { MailMessage, MailProvider } from "./provider";

let transporter: Transporter | null = null;

export const nodemailerProvider: MailProvider = {
  name: "smtp",
  async send(message: MailMessage) {
    transporter ??= nodemailer.createTransport(smtpConfig);
    await transporter.sendMail({ from: mailFrom, ...message });
  },
};
