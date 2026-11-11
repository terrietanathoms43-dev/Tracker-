"use client";

import { cn } from "cn";
import { Group, MoreHorizontal, Pencil, Ungroup } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type MouseEventHandler, type ReactNode } from "react";
import { dissolveGroup, groupTasks, renameGroup } from "@/actions/task-groups";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { LIMITS } from "@/lib/limits";
import { describeGroupCount, groupLabel } from "@/lib/tasks/groups";
import type { TaskGroupRef } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";
import { AttachTaskDialog } from "./attach-task-dialog";

// Tasks grouped together (docs/PLAN.md, 2026-11-11 log): equals, on the same level, that every list draws side by
// side inside one border. This file is how a group looks and is managed: the bordered block a list wraps a group's
// rows in (its name, how many of it are here, Rename and Ungroup all), the chip a task carries when the rest of its
// group is not on the page, and the two small dialogs (name a new group, rename one).

/** The name field both dialogs share. */
function NameField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <Field id="group-name" label="Name" hint="Optional: what these tasks have in common." count={{ value, max: LIMITS.groupName }}>
      <Input id="group-name" value={value} onChange={(event) => onChange(event.target.value)} placeholder="e.g. Login revamp" maxLength={LIMITS.groupName} autoFocus />
    </Field>
  );
}

/** Renames a group, or clears its name. */
function RenameGroupDialog({ group, onClose }: { group: TaskGroupRef; onClose: () => void }) {
  const [name, setName] = useState(group.name ?? "");
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      if (toastResult(await renameGroup({ groupId: group.id, name }))) onClose();
    });
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md" data-group-rename-dialog>
        <DialogHeader>
          <DialogTitle>Rename group</DialogTitle>
          <DialogDescription>The name shows on the border around the group in every list. Leave it empty for a group without a name.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <NameField value={name} onChange={setName} />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending} data-group-rename-save>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Asks before a whole group is ungrouped: the tasks stay, only the border goes. */
function UngroupAllDialog({ group, onClose }: { group: TaskGroupRef; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ungroup {group.size === 1 ? "this task" : `these ${group.size} tasks`}?</DialogTitle>
          <DialogDescription>The tasks stay exactly as they are, each where it is. Only the group goes: they stop showing together.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            data-group-dissolve-confirm
            onClick={() =>
              startTransition(async () => {
                if (toastResult(await dissolveGroup({ groupId: group.id }))) onClose();
              })
            }
          >
            {pending ? "Working…" : "Ungroup all"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rename and Ungroup all, behind a "⋯" on the group's border. */
export function GroupMenu({ group, className }: { group: TaskGroupRef; className?: string }) {
  const [dialog, setDialog] = useState<"rename" | "dissolve" | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for the group ${groupLabel(group)}`}
          data-group-menu
          className={cn("grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setDialog("rename")} data-group-rename>
            <Pencil />
            Rename group…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("dissolve")} data-group-dissolve>
            <Ungroup />
            Ungroup all
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === "rename" ? <RenameGroupDialog group={group} onClose={() => setDialog(null)} /> : null}
      {dialog === "dissolve" ? <UngroupAllDialog group={group} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

/** The strip along the top of a group's border: the mark, the name, how many are here, and the menu. */
export function GroupHeading({ group, shown, readOnly = false, className }: { group: TaskGroupRef; shown: number; readOnly?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 border-b border-primary/20 bg-primary/[0.07] px-3 py-1 text-[13px] sm:px-4", className)} data-group-heading>
      <Group className="size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 truncate font-medium text-foreground" data-group-name>
        {groupLabel(group)}
      </span>
      <span className="shrink-0 text-muted-foreground tabular-nums" data-group-count>
        {describeGroupCount(shown, group.size)}
      </span>
      {readOnly ? null : <GroupMenu group={group} className="-mr-1 ml-auto" />}
    </div>
  );
}

/**
 * A group's rows inside one border, as one item of a list of rows: put `TaskRow`s inside. The border is the point:
 * these tasks are on the same level and belong together.
 */
export function TaskGroupBlock({ group, shown, readOnly = false, children }: { group: TaskGroupRef; shown: number; readOnly?: boolean; children: ReactNode }) {
  return (
    <li className="p-1.5 sm:p-2" data-task-group={group.id} data-group-shown={shown}>
      <section aria-label={`Group: ${groupLabel(group)}, ${describeGroupCount(shown, group.size)}`} className="overflow-hidden rounded-lg border-2 border-primary/35 bg-primary/[0.025]">
        <GroupHeading group={group} shown={shown} readOnly={readOnly} />
        <ul className="divide-y divide-primary/15">{children}</ul>
      </section>
    </li>
  );
}

/**
 * What a task carries when the rest of its group is not on the page (a filter, another section): the group's name
 * and size, linking to the task page's Group section, where all of it is listed.
 */
export function GroupChip({ taskId, group, onClick, className }: { taskId: string; group: TaskGroupRef; onClick?: MouseEventHandler<HTMLAnchorElement>; className?: string }) {
  return (
    <Link
      href={`/tasks/${taskId}#group`}
      prefetch={false}
      onClick={onClick}
      title={`Grouped with ${group.size - 1} other ${group.size - 1 === 1 ? "task" : "tasks"}`}
      className={cn("inline-flex h-5 min-w-0 max-w-[40%] shrink items-center gap-1 rounded-md border border-primary/35 bg-primary/[0.05] px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground", className)}
      data-group-chip={group.id}
    >
      <Group className="size-3 shrink-0 text-primary" aria-hidden />
      <span className="truncate">{groupLabel(group)}</span>
      <span className="shrink-0 tabular-nums">· {group.size}</span>
    </Link>
  );
}

/**
 * The Group line of a task page's Details: the group it is in (a link to the page's Group section), or, for someone
 * who may group it, "Group with a task…", which opens the search and puts the two together.
 */
export function GroupField({ taskId, title, group, canGroup }: { taskId: string; title: string; group: TaskGroupRef | null; canGroup: boolean }) {
  const [picking, setPicking] = useState(false);
  if (group !== null) {
    return (
      <a href="#group" className="text-link underline-offset-4 hover:underline" data-group-field>
        {groupLabel(group)} · {group.size} tasks
      </a>
    );
  }
  if (!canGroup) return <span className="text-muted-foreground">Not grouped</span>;
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)} data-group-with>
        <Group aria-hidden />
        Group with a task…
      </Button>
      {picking ? <AttachTaskDialog mode="group" taskIds={[taskId]} title={title} onClose={() => setPicking(false)} /> : null}
    </>
  );
}

type BulkOutcome = { done: number; failed: { id: string; title: string; error: string }[] };

/**
 * "Group together" on the selection bar: an optional name, then the ticked tasks become one group (or join the
 * group one of them is already in). `run` is the bar's own runner, so the outcome is told the way every bulk action is.
 */
export function GroupTogetherDialog({ taskIds, pending, onClose, run }: { taskIds: string[]; pending: boolean; onClose: () => void; run: (action: () => Promise<ActionResult<BulkOutcome>>) => void }) {
  const [name, setName] = useState("");
  const count = taskIds.length;
  const apply = () => run(() => groupTasks({ taskIds, name }));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md" data-group-dialog>
        <DialogHeader>
          <DialogTitle>Group {count} tasks together</DialogTitle>
          <DialogDescription>
            They stay separate tasks on the same level, and show side by side inside one border in every list. If one of them is already in a group, the others join it. A sub-task goes with its parent: group the parent instead.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <NameField value={name} onChange={setName} />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={pending} data-group-apply>
            {pending ? "Working…" : "Group together"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
