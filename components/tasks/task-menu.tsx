"use client";

import { cn } from "cn";
import { ExternalLink, FolderPlus, Goal, MoreHorizontal, NotebookPen, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { deleteTask, editTask, getTaskFormOptions, setAssignees } from "@/actions/tasks";
import { NativeSelect } from "@/components/native-select";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/constants";
import { idsOf } from "@/lib/tasks/assignees";
import type { TaskFormOptions, TaskListItem } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";
import { AssigneePicker } from "./assignee-picker";
import { StatusMenuItems, useChangeStatus } from "./status-menu";
import { useTaskActions } from "./task-actions";

// The two or three things people do from a list without opening the task (apex-ux §6): Update progress,
// Change status, and the field edits below. A "⋯" menu with a pointer, a bottom sheet after a long press on touch.

type MenuDialog = "assign" | "goal" | "project" | "delete" | null;

function useMenuDialog() {
  const [dialog, setDialog] = useState<MenuDialog>(null);
  return { dialog, open: setDialog, close: () => setDialog(null) };
}

/** Fetches the New-task pickers' options the first time a field dialog opens. */
function useFormOptions(open: boolean): TaskFormOptions | null {
  const [options, setOptions] = useState<TaskFormOptions | null>(null);
  useEffect(() => {
    if (!open || options !== null) return;
    let live = true;
    void getTaskFormOptions().then((result) => {
      if (!live) return;
      if (result.ok) setOptions(result.data);
      else toast.error(result.error);
    });
    return () => {
      live = false;
    };
  }, [open, options]);
  return options;
}

/** Runs an action from a dialog's Save/Delete button: toasts the result and closes on success. */
function useSave(onClose: () => void) {
  const [pending, startTransition] = useTransition();
  const save = (action: () => Promise<Parameters<typeof toastResult>[0]>) =>
    startTransition(async () => {
      if (toastResult(await action())) onClose();
    });
  return { pending, save };
}

function AssignDialog({ task, onClose }: { task: TaskListItem; onClose: () => void }) {
  const options = useFormOptions(true);
  const { pending, save } = useSave(onClose);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => idsOf(task.assignees));
  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign task</DialogTitle>
          <DialogDescription className="truncate">{task.title}</DialogDescription>
        </DialogHeader>
        <AssigneePicker
          label="Assigned to"
          value={assigneeIds}
          onChange={setAssigneeIds}
          options={options ? { people: options.people, viewerId: options.viewerId } : null}
          disabled={pending}
          className="w-full max-w-none justify-start"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending || options === null} onClick={() => save(() => setAssignees({ taskId: task.id, assigneeIds }))}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttachDialog({ task, kind, onClose }: { task: TaskListItem; kind: "goal" | "project"; onClose: () => void }) {
  const options = useFormOptions(true);
  const { pending, save } = useSave(onClose);
  const field = kind === "goal" ? "goalId" : "projectId";
  const [value, setValue] = useState(kind === "goal" ? (task.goalId ?? "") : (task.project?.id ?? ""));
  const choices = kind === "goal" ? options?.goals.map((g) => ({ value: g.id, label: g.title })) : options?.projects.map((p) => ({ value: p.id, label: p.name }));
  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach to {kind === "goal" ? "a goal" : "a project"}</DialogTitle>
          <DialogDescription className="truncate">{task.title}</DialogDescription>
        </DialogHeader>
        <NativeSelect aria-label={kind === "goal" ? "Goal" : "Project"} className="w-full" value={value} disabled={pending || options === null} onChange={(e) => setValue(e.target.value)}>
          <option value="">{kind === "goal" ? "No goal" : "No project"}</option>
          {choices?.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </NativeSelect>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending || options === null} onClick={() => save(() => editTask({ taskId: task.id, field, value }))}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ task, onClose }: { task: TaskListItem; onClose: () => void }) {
  const { pending, save } = useSave(onClose);
  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete task?</DialogTitle>
          <DialogDescription>
            &ldquo;{task.title}&rdquo; and all of its progress updates, comments and history will be removed permanently.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => save(() => deleteTask({ taskId: task.id }))}>
            Delete task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The assign / attach / delete dialogs behind the menu items; shared by the "⋯" menu and the touch sheet. */
function MenuDialogs({ task, dialog, onClose }: { task: TaskListItem; dialog: MenuDialog; onClose: () => void }) {
  if (dialog === "assign") return <AssignDialog task={task} onClose={onClose} />;
  if (dialog === "goal" || dialog === "project") return <AttachDialog task={task} kind={dialog} onClose={onClose} />;
  if (dialog === "delete") return <DeleteDialog task={task} onClose={onClose} />;
  return null;
}

const ATTACH_ITEMS: { key: MenuDialog & string; label: string; icon: typeof UserPlus }[] = [
  { key: "assign", label: "Assign to…", icon: UserPlus },
  { key: "goal", label: "Attach to goal…", icon: Goal },
  { key: "project", label: "Attach to project…", icon: FolderPlus },
];

/** The "⋯" menu for a row or a board card. */
export function TaskMenu({ task, className }: { task: TaskListItem; className?: string }) {
  const { openUpdate } = useTaskActions();
  const { change } = useChangeStatus(task.id);
  const [options, setOptions] = useState<TaskFormOptions | null>(null);
  const [, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  // The New-task form's pickers feed the sub-menus; fetched once, the first time the menu opens.
  const loadOptions = (open: boolean) => {
    if (!open || options !== null) return;
    void getTaskFormOptions().then((result) => (result.ok ? setOptions(result.data) : toast.error(result.error)));
  };

  const current = idsOf(task.assignees);
  const assign = (assigneeIds: string[]) => startTransition(async () => void toastResult(await setAssignees({ taskId: task.id, assigneeIds })));
  const toggleAssignee = (id: string, on: boolean) => (on ? [...current, id] : current.filter((x) => x !== id));
  const attach = (field: "goalId" | "projectId", value: string) =>
    startTransition(async () => void toastResult(await editTask({ taskId: task.id, field, value })));

  return (
    <>
      <DropdownMenu onOpenChange={loadOptions}>
        <DropdownMenuTrigger
          aria-label={`Actions for ${task.title}`}
          className={cn(
            "relative grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => openUpdate(task.id)}>
            <NotebookPen />
            Update progress
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <StatusIcon status={task.status} />
              Change status
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <StatusMenuItems current={task.status} onPick={(status) => change(task.status, status)} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <UserPlus />
              Assign to…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {options === null ? (
                <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
              ) : (
                options.people.map((person) => (
                  // preventDefault keeps the menu open, so several people can be checked in one visit.
                  <DropdownMenuCheckboxItem
                    key={person.id}
                    checked={current.includes(person.id)}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(on) => assign(toggleAssignee(person.id, on))}
                  >
                    {person.name}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Goal />
              Attach to goal…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {options === null ? (
                <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
              ) : (
                <DropdownMenuRadioGroup value={task.goalId ?? ""} onValueChange={(value) => attach("goalId", value)}>
                  <DropdownMenuRadioItem value="">No goal</DropdownMenuRadioItem>
                  {options.goals.map((goal) => (
                    <DropdownMenuRadioItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <FolderPlus />
              Attach to project…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {options === null ? (
                <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
              ) : (
                <DropdownMenuRadioGroup value={task.project?.id ?? ""} onValueChange={(value) => attach("projectId", value)}>
                  <DropdownMenuRadioItem value="">No project</DropdownMenuRadioItem>
                  {options.projects.map((project) => (
                    <DropdownMenuRadioItem key={project.id} value={project.id}>
                      {project.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {task.canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                <Trash2 />
                Delete task
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {deleting ? <DeleteDialog task={task} onClose={() => setDeleting(false)} /> : null}
    </>
  );
}

function SheetButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-base transition-colors hover:bg-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** The same actions as TaskMenu, as a bottom sheet with 44px targets, for touch screens. */
export function TaskActionSheet({ task, open: sheetOpen, onOpenChange, readOnly = false }: { task: TaskListItem; open: boolean; onOpenChange: (open: boolean) => void; readOnly?: boolean }) {
  const router = useRouter();
  const { openUpdate } = useTaskActions();
  const { change } = useChangeStatus(task.id);
  const { dialog, open, close } = useMenuDialog();
  const then = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };
  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <SheetHeader>
            <SheetTitle className="truncate pr-6">{task.title}</SheetTitle>
            <SheetDescription>{TASK_STATUS_LABELS[task.status]}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-1 px-4">
            {readOnly ? null : (
              <SheetButton onClick={then(() => openUpdate(task.id))}>
                <NotebookPen className="size-4 text-muted-foreground" />
                Update progress
              </SheetButton>
            )}
            <SheetButton onClick={then(() => router.push(`/tasks/${task.id}`))}>
              <ExternalLink className="size-4 text-muted-foreground" />
              Open task
            </SheetButton>
            {readOnly ? null : (
              <>
                {ATTACH_ITEMS.map(({ key, label, icon: Icon }) => (
                  <SheetButton key={key} onClick={then(() => open(key))}>
                    <Icon className="size-4 text-muted-foreground" />
                    {label}
                  </SheetButton>
                ))}
                {task.canDelete ? (
                  <SheetButton onClick={then(() => open("delete"))}>
                    <Trash2 className="size-4 text-destructive" />
                    <span className="text-destructive">Delete task</span>
                  </SheetButton>
                ) : null}
                <p className="px-3 pt-3 pb-1 text-[13px] text-muted-foreground">Change status</p>
                <div className="grid grid-cols-2 gap-1">
                  {TASK_STATUSES.map((status) => (
                    <SheetButton key={status} disabled={status === task.status} onClick={then(() => change(task.status, status))}>
                      <StatusIcon status={status} />
                      {TASK_STATUS_LABELS[status]}
                    </SheetButton>
                  ))}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <MenuDialogs task={task} dialog={dialog} onClose={close} />
    </>
  );
}
