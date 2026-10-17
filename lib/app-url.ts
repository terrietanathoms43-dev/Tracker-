/**
 * The public origin of this deployment, for links that leave the app (emails, invitations).
 * Production sets AUTH_URL. Vercel preview deployments have no fixed origin, so VERCEL_URL is used there.
 * Locally it is the dev server.
 */
export function appOrigin(): string {
  const configured = process.env.AUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  try {
    return new URL(configured ?? "http://localhost:3020").origin;
  } catch {
    return "http://localhost:3020";
  }
}
