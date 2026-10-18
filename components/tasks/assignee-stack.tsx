import { cn } from "cn";
import { UsersRound } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { describeAssignees } from "@/lib/tasks/assignees";
import { nameOf } from "@/lib/tasks/people";
import type { Assignees } from "@/lib/tasks/types";

// Who is on a task, at a glance: overlapping avatars for the people, a small chip per team, a dashed circle when
// nobody is. The same piece serves rows, cards, the task header and the report tables.

/** How many avatars a stack shows before "+N". */
const MAX_AVATARS = 3;

/** A team as a small chip: icon and name. */
export function TeamChip({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 max-w-40 items-center gap-1 rounded-md bg-secondary px-1.5 text-[11px] font-medium text-secondary-foreground", className)}>
      <UsersRound className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * Avatars (up to three, then "+N") and team chips. `names` writes the names out instead of stacking (the task
 * header, the Details card). The whole thing is labelled with everyone's name for screen readers and hover.
 */
export function AssigneeStack({ assignees, names = false, className }: { assignees: Assignees; names?: boolean; className?: string }) {
  const label = describeAssignees(assignees);
  const { people, teams } = assignees;
  if (people.length === 0 && teams.length === 0) {
    return <span className={cn("inline-flex size-6 shrink-0 rounded-full border border-dashed", className)} title="Unassigned" aria-label="Unassigned" role="img" />;
  }
  if (names) {
    return (
      <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)} title={label}>
        {people.map((person) => (
          <span key={person.id} className="inline-flex min-w-0 items-center gap-1.5">
            <UserAvatar name={person.name} email={person.email} image={person.image} size="sm" className="size-5" />
            <span className="truncate text-foreground">{nameOf(person)}</span>
          </span>
        ))}
        {teams.map((team) => (
          <TeamChip key={team.id} name={team.name} />
        ))}
      </span>
    );
  }
  const shown = people.slice(0, MAX_AVATARS);
  const more = people.length - shown.length;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)} title={label} role="img" aria-label={label}>
      {shown.length > 0 ? (
        <span className="flex -space-x-1.5">
          {shown.map((person) => (
            <UserAvatar key={person.id} name={person.name} email={person.email} image={person.image} size="sm" className="ring-2 ring-card" />
          ))}
        </span>
      ) : null}
      {more > 0 ? <span className="text-[11px] font-medium text-muted-foreground tabular-nums">+{more}</span> : null}
      {teams.slice(0, 2).map((team) => (
        <TeamChip key={team.id} name={team.name} className="hidden sm:inline-flex" />
      ))}
      {teams.length > 2 ? <span className="hidden text-[11px] font-medium text-muted-foreground tabular-nums sm:inline">+{teams.length - 2}</span> : null}
      {teams.length > 0 ? <TeamChip name={teams.length === 1 ? teams[0].name : `${teams.length} teams`} className="sm:hidden" /> : null}
    </span>
  );
}
