import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** Client-side: a toast for an action's outcome. Returns whether it succeeded. */
export function toastResult<T>(result: ActionResult<T> | undefined, fallbackSuccess?: string): result is { ok: true; data: T; message?: string } {
  if (result === undefined) return false;
  if (result.ok) {
    const message = result.message ?? fallbackSuccess;
    if (message) toast.success(message);
    return true;
  }
  toast.error(result.error);
  return false;
}
