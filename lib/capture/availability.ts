import "server-only";
import { getOrgConfig, type AiProvider } from "@/lib/dal/org-config";
import { decryptSecret } from "@/lib/secrets";
import { isTestEmail, testModeEnabled } from "@/lib/test-mode";

// Whether "Capture from a meeting" is on for this workspace, and which engine reads the transcript
// (docs/PLAN.md, 2026-11-01 log). An admin may set the provider and key per workspace from Settings
// (org_config, encrypted — lib/secrets.ts); without it the deployment's ANTHROPIC_API_KEY is the fallback,
// the way the Google button is hidden until its credentials exist: nothing leaves the server unless someone
// chose to switch it on. Test personas never reach a model (nothing of theirs costs money or leaves the
// machine, like email to a .test address); in development they, and anyone with CAPTURE_PROVIDER=fake, get
// the plain parser instead.

export type CaptureEngine =
  | { provider: AiProvider; model: string; apiKey: string | null }
  | { provider: "fake" };

/** The model the helper asks, overridable per deployment. */
export const CAPTURE_MODEL = process.env.CAPTURE_MODEL || "claude-opus-5-5";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const modelFor = (provider: AiProvider) => (provider === "openai" ? OPENAI_MODEL : CAPTURE_MODEL);

/**
 * The engine for this person and workspace, or null when the feature is off for them. A workspace key set in
 * the admin panel wins; a stored key that can no longer be decrypted (secret rotated) falls back to the
 * deployment env rather than dying on the person mid-flow.
 */
export async function captureEngineFor(email: string | null | undefined, orgId: string): Promise<CaptureEngine | null> {
  if (testModeEnabled() && (isTestEmail(email) || process.env.CAPTURE_PROVIDER === "fake")) return { provider: "fake" };
  const config = await getOrgConfig(orgId);
  if (config.aiProvider !== null && config.aiApiKey !== null) {
    const apiKey = decryptSecret(config.aiApiKey);
    if (apiKey !== null) return { provider: config.aiProvider, model: modelFor(config.aiProvider), apiKey };
  }
  if ((process.env.ANTHROPIC_API_KEY ?? "").length > 0) return { provider: "anthropic", model: CAPTURE_MODEL, apiKey: null };
  return null;
}
