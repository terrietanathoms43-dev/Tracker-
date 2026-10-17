import "server-only";
import { GuardError } from "@/lib/action-result";
import { canManageOrg } from "@/lib/permissions";
import { requireViewerContext, type ViewerContext } from "@/lib/viewer";

/** For organization administration actions: signed in, active org, and admin of it. */
export async function requireOrgAdmin(): Promise<ViewerContext> {
  const context = await requireViewerContext();
  if (!canManageOrg(context.viewer)) throw new GuardError("forbidden");
  return context;
}
