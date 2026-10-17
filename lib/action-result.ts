import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { errorFields, log } from "@/lib/log";

/** What every server action returns: the UI shows `error` (and `fieldErrors` next to inputs) or a success toast. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail<T = never>(error: string, fieldErrors?: Record<string, string[] | undefined>): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

// User-safe messages: nothing internal ever reaches the client.
export const ERR = {
  unauthorized: "You need to sign in to do that.",
  forbidden: "You don't have permission to do that.",
  notFound: "That doesn't exist, or you can't see it.",
  badRequest: "Some of that didn't look right. Check the form and try again.",
  conflict: "That was just changed by someone else. Refresh and try again.",
  server: "Something went wrong. Please try again.",
} as const;

/** Thrown by guards and DAL lookups; `runAction` turns it into a failed ActionResult. */
export class GuardError extends Error {
  constructor(
    public readonly code: "unauthorized" | "forbidden" | "not_found" | "conflict",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function guardMessage(error: GuardError): string {
  if (error.message !== error.code) return error.message;
  if (error.code === "not_found") return ERR.notFound;
  return ERR[error.code];
}

/**
 * The action skeleton: zod parse → run (which does requireViewer → permission → transaction) → ActionResult.
 * redirect() / notFound() inside `run` still work: Next's control-flow errors are rethrown.
 */
export async function runAction<S extends z.ZodType, T>(
  name: string,
  schema: S,
  input: unknown,
  run: (data: z.infer<S>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return fail(flat.formErrors[0] ?? ERR.badRequest, flat.fieldErrors as Record<string, string[] | undefined>);
  }
  try {
    return await run(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof GuardError) return fail(guardMessage(error));
    log.error("action.failed", { action: name, ...errorFields(error) });
    return fail(ERR.server);
  }
}

/** FormData → plain object for zod (repeated keys become arrays). */
export function formToObject(form: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const key of new Set(form.keys())) {
    const all = form.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}
