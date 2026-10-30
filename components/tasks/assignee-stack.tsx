import { cn } from "cn";
import { UserAvatar } from "@/components/user-avatar";
import { describeAssignees } from "@/lib/tasks/assignees";
import { nameOf } from "@/lib/tasks/people";
import type { Assignees } from "@/lib/tasks/types";

// Who is on a task, at a glance: overlapping avatar circles for the people, a dashed circle when nobody is.
// The same piece serves rows, cards, the task header and the report rows.

/** How many avatars a stack shows before "+N". */
const MAX_AVATARS = 3;

/**
 * Avatars (up to three, then "+N"). `names` writes the names out instead of stacking (the task header, the
 * Details card). The whole thing is labelled with everyone's name for screen readers and hover.
 */
export function AssigneeStack({ assignees, names = false, max = MAX_AVATARS, className }: { assignees: Assignees; names?: boolean; max?: number; className?: string }) {
  const label = describeAssignees(assignees);
  if (assignees.length === 0) {
    return <span className={cn("inline-flex size-6 shrink-0 rounded-full border border-dashed", className)} title="Unassigned" aria-label="Unassigned" role="img" />;
  }
  if (names) {
    return (
      <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)} title={label}>
        {assignees.map((person) => (
          <span key={person.id} className="inline-flex min-w-0 items-center gap-1.5">
            <UserAvatar name={person.name} email={person.email} image={person.image} size="sm" className="size-5" />
            <span className="truncate text-foreground">{nameOf(person)}</span>
          </span>
        ))}
      </span>
    );
  }
  const shown = assignees.slice(0, max);
  const more = assignees.length - shown.length;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)} title={label} role="img" aria-label={label}>
      <span className="flex -space-x-1.5">
        {shown.map((person) => (
          <UserAvatar key={person.id} name={person.name} email={person.email} image={person.image} size="sm" className="ring-2 ring-card" />
        ))}
      </span>
      {more > 0 ? <span className="text-xs font-medium text-muted-foreground tabular-nums">+{more}</span> : null}
    </span>
  );
}
