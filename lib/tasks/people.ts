import type { OrgRole } from "@/lib/constants";

// How a person is named in task screens: their name, else their email, else a word that fits the sentence.

export const nameOf = (person: { name: string | null; email: string | null } | null | undefined, fallback = "Someone"): string =>
  person?.name ?? person?.email ?? fallback;

/** "(leader)" / "(admin)" after a name in approver pickers, so the usual approvers stand out. */
export const roleSuffix = (role: OrgRole): string => (role === "leader" ? " (leader)" : role === "admin" ? " (admin)" : "");
