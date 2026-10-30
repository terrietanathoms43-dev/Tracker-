import { z } from "zod";
import { LIMITS } from "@/lib/limits";

/**
 * Input hygiene for every piece of text a person can type (see AGENTS.md: "character limits to keep the
 * interface from crashing"). React escapes what it renders and Drizzle parameterizes what it queries, so
 * the remaining risks are control characters (null bytes, C0 controls) sneaking into stored text, logs
 * and exports. `sanitizeText` strips them while keeping newlines and tabs — descriptions stay readable.
 */
export const sanitizeText = (value: string) =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

/** User text with a cap and no minimum: trimmed, sanitized, at most `max` characters, empty by default. */
export const cappedText = (max: number, maxMessage?: string) =>
  z
    .string()
    .trim()
    .transform(sanitizeText)
    .pipe(z.string().max(max, maxMessage));

/** Required user text: trimmed, sanitized, between `min` and `max` characters. */
export const requiredText = (min: number, max: number, minMessage?: string, maxMessage?: string) =>
  z
    .string()
    .trim()
    .transform(sanitizeText)
    .pipe(z.string().min(min, minMessage).max(max, maxMessage));

/** Optional user text: `cappedText` that also tolerates being left out entirely. */
export const optionalText = (max: number) => cappedText(max).default("");

/** A link a person pastes: http(s) only, and never longer than LIMITS.url — a "link" that is really a data dump
 *  is rejected instead of stored. Required version (evidence added on its own). */
export const requiredLink = () =>
  z.url({ protocol: /^https?$/, error: "Use a full http(s) link." }).max(LIMITS.url, "That link is too long.");

/** The same link where empty means "none", so optional evidence stays optional. */
export const optionalLink = () => z.union([z.literal(""), requiredLink()]).default("");
