import type { CaptureProvider } from "@/lib/capture/draft";
import { isTestEmail, testModeEnabled } from "@/lib/test-mode";

// Whether "Capture from a meeting" is on, and which engine reads the transcript (docs/PLAN.md, 2026-11-01 log).
// The feature is hidden until the owner sets ANTHROPIC_API_KEY, the way the Google button is hidden until its
// credentials exist: nothing leaves the server unless someone chose to switch it on. Test personas never reach the
// model (nothing of theirs costs money or leaves the machine, like email to a .test address); in development they,
// and anyone with CAPTURE_PROVIDER=fake, get the plain parser instead.

/** The engine for this person, or null when the feature is off for them. */
export function captureProviderFor(email: string | null | undefined): CaptureProvider | null {
  if (testModeEnabled() && (isTestEmail(email) || process.env.CAPTURE_PROVIDER === "fake")) return "fake";
  if ((process.env.ANTHROPIC_API_KEY ?? "").length > 0) return "anthropic";
  return null;
}

/** The model the helper asks, overridable per deployment. */
export const CAPTURE_MODEL = process.env.CAPTURE_MODEL || "claude-opus-5-5";
