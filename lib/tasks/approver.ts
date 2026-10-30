import type { OrgRole } from "@/lib/constants";

// Who approves a task when nobody has been named yet (docs/PLAN.md §5).

/**
 * The task's current approver, else the first leader who isn't assigned to it, else an admin who isn't, else any
 * leader or admin. Leaders come before admins because they are the people who sign off day-to-day work. Only the
 * people assigned are excluded.
 */
export function defaultApproverFor(people: { id: string; role: OrgRole }[], approverId: string | null, assigneeIds: readonly string[]): string | null {
  if (approverId) return approverId;
  const notAssignee = (person: { id: string }) => !assigneeIds.includes(person.id);
  return (
    people.find((person) => person.role === "leader" && notAssignee(person))?.id ??
    people.find((person) => person.role === "admin" && notAssignee(person))?.id ??
    people.find((person) => person.role === "leader" || person.role === "admin")?.id ??
    null
  );
}
