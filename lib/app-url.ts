/**
 * The public origin of this deployment, for links that leave the app (emails, invitations).
 * Production and development set BETTER_AUTH_URL (AUTH_URL is accepted too); otherwise the dev port.
 */
export function appOrigin(): string {
  const configured = process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  try {
    return new URL(configured ?? "http://localhost:3015").origin;
  } catch {
    return "http://localhost:3015";
  }
}
