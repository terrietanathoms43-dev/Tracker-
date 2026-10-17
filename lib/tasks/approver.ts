import type { OrgRole } from "@/lib/constants";

// Who approves a task when nobody has been named yet (docs/PLAN.md §5).

/**
 * The task's current approver, else the first leader who isn't the assignee, else an admin who isn't, else any
 * leader or admin. Leaders come before admins because they are the people who sign off day-to-day work.
 */
export function defaultApproverFor(people: { id: string; role: OrgRole }[], approverId: string | null, assigneeId: string | null): string | null {
  if (approverId) return approverId;
  const notAssignee = (person: { id: string }) => person.id !== assigneeId;
  return (
    people.find((person) => person.role === "leader" && notAssignee(person))?.id ??
    people.find((person) => person.role === "admin" && notAssignee(person))?.id ??
    people.find((person) => person.role === "leader" || person.role === "admin")?.id ??
    null
  );
}
