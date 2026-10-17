// SMTP settings from either naming convention: this project's .env.local uses SMTP_HOST / SMTP_PORT /
// EMAIL / EMAIL_PASS; the Auth.js docs use EMAIL_SERVER_*. Gmail defaults.
const port = Number(process.env.SMTP_PORT ?? process.env.EMAIL_SERVER_PORT ?? 587);
const user = process.env.EMAIL ?? process.env.SMTP_USER ?? process.env.EMAIL_SERVER_USER;
const pass = process.env.EMAIL_PASS ?? process.env.SMTP_PASS ?? process.env.EMAIL_SERVER_PASSWORD;

export const smtpConfig = {
  host: process.env.SMTP_HOST ?? process.env.EMAIL_SERVER_HOST ?? "smtp.gmail.com",
  port,
  secure: (process.env.SMTP_SECURE ?? "").toLowerCase() === "true" || port === 465,
  auth: { user, pass },
};

export const smtpConfigured = Boolean(user && pass);

export const mailFrom = process.env.EMAIL_FROM ?? `Trackwise <${user ?? "no-reply@localhost"}>`;
