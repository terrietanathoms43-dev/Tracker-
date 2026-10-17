/**
 * A same-site path to send someone to after sign-in, or the fallback. Rejects absolute URLs and the
 * protocol-relative forms browsers accept ("//host" and "/\host", which Chrome normalizes to "//host").
 */
export function safePath(value: unknown, fallback = "/home"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
