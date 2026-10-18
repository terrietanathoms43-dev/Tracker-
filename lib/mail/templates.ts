import { APP_NAME } from "@/lib/constants";
import type { MailMessage } from "./provider";

// Emails cannot read globals.css, so the palette is literal: the light theme's page / card / border / text /
// muted values, and Trackwise royal blue for the one button.
const BRAND = "#234a9e";

/**
 * The button is a one-cell table with the colour on the cell AND the link (long-hand `background-color`,
 * which every client keeps; the `background` shorthand gets stripped by some, leaving white text on white),
 * and the raw link is printed underneath so the email works even where buttons are hidden or styles dropped.
 */
function button(action: { label: string; url: string }): string {
  const url = escapeHtml(action.url);
  return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px;">
        <tr>
          <td align="center" bgcolor="${BRAND}" style="background-color:${BRAND};border-radius:8px;">
            <a href="${url}" style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:600;color:#ffffff;background-color:${BRAND};border:1px solid ${BRAND};border-radius:8px;text-decoration:none;">${escapeHtml(action.label)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:#737373;word-break:break-all;">Or copy this link into your browser:<br><a href="${url}" style="color:${BRAND};">${url}</a></p>`;
}

function layout(heading: string, bodyHtml: string, action: { label: string; url: string }, footnote: string): string {
  return `
  <div style="background:#fafafa;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;padding:28px 28px 24px;">
      <p style="margin:0 0 20px;font-size:14px;font-weight:600;color:${BRAND};letter-spacing:-0.01em;">${APP_NAME}</p>
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#262626;letter-spacing:-0.02em;">${escapeHtml(heading)}</h1>
      <div style="font-size:14px;line-height:1.6;color:#525252;">${bodyHtml}</div>
      ${button(action)}
      <p style="margin:0;font-size:12px;line-height:1.5;color:#737373;">${escapeHtml(footnote)}</p>
    </div>
  </div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function magicLinkEmail({ to, url }: { to: string; url: string }): MailMessage {
  const host = new URL(url).host;
  return {
    to,
    subject: `Your ${APP_NAME} sign-in link`,
    text: `Sign in to ${APP_NAME} (${host}):\n${url}\n\nThe link works once and expires in 24 hours. If you didn't ask for it, ignore this email.`,
    html: layout(
      `Sign in to ${APP_NAME}`,
      `<p style="margin:0;">Use the button below to sign in on <strong>${escapeHtml(host)}</strong>.</p>`,
      { label: "Sign in", url },
      "The link works once and expires in 24 hours. If you didn't ask for it, you can ignore this email.",
    ),
  };
}

export function notificationEmail(input: { to: string; title: string; body: string | null; url: string }): MailMessage {
  const { to, title, body, url } = input;
  return {
    to,
    subject: `${title} · ${APP_NAME}`,
    text: `${title}\n${body ? `${body}\n` : ""}\nOpen it: ${url}\n\nYou can change which emails you get under Settings in ${APP_NAME}.`,
    html: layout(
      title,
      body ? `<p style="margin:0;">${escapeHtml(body)}</p>` : "",
      { label: `Open in ${APP_NAME}`, url },
      `You can change which emails you get under Settings in ${APP_NAME}.`,
    ),
  };
}

export function invitationEmail(input: { to: string; url: string; orgName: string; inviterName: string; roleLabel: string }): MailMessage {
  const { to, url, orgName, inviterName, roleLabel } = input;
  return {
    to,
    subject: `${inviterName} invited you to ${orgName} on ${APP_NAME}`,
    text: `${inviterName} invited you to join ${orgName} on ${APP_NAME} as ${roleLabel}.\n\nAccept the invitation:\n${url}\n\nSign in with this email address (${to}). The invitation expires in 7 days.`,
    html: layout(
      `Join ${orgName} on ${APP_NAME}`,
      `<p style="margin:0;">${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(orgName)}</strong> as ${escapeHtml(roleLabel)}.</p>`,
      { label: "Accept invitation", url },
      `Sign in with this email address (${to}). The invitation expires in 7 days.`,
    ),
  };
}
