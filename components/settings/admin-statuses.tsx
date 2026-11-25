"use client";

import {
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  defaultAnimateLayoutChanges,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import { Archive, ArchiveRestore, GripVertical, Pencil, Trash2 } from "lucide-react";
import { createElement, useId, useState, useTransition } from "react";
import { deleteTaskStatus, reorderTaskStatuses, saveTaskStatus, setStatusArchived } from "@/actions/config";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { archiveLocked, closedLocked, STATUS_ICONS, STATUS_TONES, TONE_CLASSES, type StatusCatalog, type StatusTone, type TaskStatusDef } from "@/lib/statuses";
import { toastResult } from "@/lib/toast-result";
import { Section } from "./section";

// Admins: the workspace's task statuses. Rows drag to reorder (the same sortable machinery as the tab rows and
// the board); each status edits through a dialog — its label, icon, colour and whether it closes a task —
// because a rename lands on every task that has the status. Built-ins keep their behaviour whatever they're
// called; a custom status is only ever open or closed (closed asks for a reason, like Rejected). Statuses are
// archived, never deleted: what has one keeps it, and nobody can pick it again until it's restored.

const measuringConfig = { droppable: { strategy: MeasuringStrategy.Always } };
const animateLayoutChanges: AnimateLayoutChanges = (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true });
const dropAnimationConfig: DropAnimation = { sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }) };

const rowClass = "flex items-center gap-3 px-4 py-2.5 sm:px-5";
const plural = (count: number) => (count === 1 ? "task" : "tasks");
const counted = (count: number) => `${count} ${plural(count)}`;

/** One status row: the grab surface, its icon and label, how many tasks carry it, Edit, Delete (a custom status nothing carries) and Archive (not for the two every workspace needs). */
function SortableStatusRow({ status, tasks, onEdit, onDelete, onArchive }: { status: TaskStatusDef; tasks: number; onEdit: () => void; onDelete: () => void; onArchive: () => void }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id: status.key, animateLayoutChanges });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(rowClass, "group touch-none select-none", isDragging ? "z-10 cursor-grabbing opacity-40" : "cursor-grab")} {...attributes} {...listeners}>
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <StatusIcon status={status} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {status.label}
        {status.builtin ? <span className="ml-2 text-xs font-normal text-muted-foreground" title="Comes with every workspace — its behaviour is fixed">built-in</span> : null}
        {status.closed ? <span className="ml-2 text-xs font-normal text-muted-foreground">closes the task</span> : null}
      </span>
      <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{tasks > 0 ? counted(tasks) : ""}</span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${status.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={onEdit}>
        <Pencil aria-hidden />
      </Button>
      {!status.builtin && tasks === 0 ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${status.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={onDelete}>
          <Trash2 aria-hidden />
        </Button>
      ) : null}
      {archiveLocked(status) ? (
        <span className="size-7 shrink-0" title={`Every workspace needs “${status.label}”, so it can't be archived.`} aria-hidden />
      ) : (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Archive ${status.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={onArchive}>
          <Archive aria-hidden />
        </Button>
      )}
    </div>
  );
}

function StatusRowOverlay({ status }: { status: TaskStatusDef }) {
  return (
    <div className={cn(rowClass, "w-fit rounded-md border bg-card shadow-sm")}>
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <StatusIcon status={status} />
      <span className="text-sm font-medium">{status.label}</span>
    </div>
  );
}

type Draft = { label: string; icon: string; tone: StatusTone; closed: boolean };

/** The edit/create dialog: label, icon and colour pickers, and the closes-the-task flag. `key`ed on the status, so each open starts fresh. */
function StatusDialog({ status, tasks, onClose }: { status: TaskStatusDef | null; tasks: number; onClose: () => void }) {
  const creating = status === null;
  const original: Draft = creating ? { label: "", icon: "circle", tone: "slate", closed: false } : { label: status.label, icon: status.icon, tone: status.tone, closed: status.closed };
  const [value, setValue] = useState<Draft>(original);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const renames = !creating && value.label.trim() !== "" && value.label.trim() !== original.label;
  const flips = !creating && value.closed !== original.closed;
  const dirty = creating ? value.label.trim() !== "" : renames || flips || value.icon !== original.icon || value.tone !== original.tone;
  const structural = !creating && closedLocked(status);
  const where = tasks > 0 ? `the ${counted(tasks)} with it` : "every task that gets it";
  const warning = [
    renames ? `Renames it on ${where}.` : null,
    flips ? (value.closed ? `Closes ${where}: they leave the board, stop being overdue and count as done for their goal's open work.` : `Reopens ${where}: they come back on the board and can be overdue again.`) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const open_ = (next: boolean) => {
    if (!next) onClose();
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveTaskStatus({ key: creating ? "" : status.key, label: value.label.trim(), icon: value.icon, tone: value.tone, closed: value.closed });
      if (toastResult(result)) open_(false);
    });

  return (
    <Dialog open onOpenChange={open_}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{creating ? "Add a status" : `Edit “${status.label}”`}</DialogTitle>
          <DialogDescription>
            {creating ? "A new status the workspace can pick. A closed one asks for a reason, like Rejected." : "Every task keeps this status — only how it looks and whether it closes them changes."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="status-label">Name</Label>
            <Input id="status-label" value={value.label} maxLength={40} autoFocus onChange={(event) => { setValue({ ...value, label: event.target.value }); setConfirming(false); }} />
          </div>
          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1">
              {Object.entries(STATUS_ICONS).map(([key, Icon]) => (
                <button key={key} type="button" aria-label={`Icon ${key}`} title={key.replaceAll("-", " ")} aria-pressed={value.icon === key} onClick={() => setValue({ ...value, icon: key })} className={cn("grid size-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:text-foreground", value.icon === key && "border-ring bg-accent text-foreground ring-2 ring-ring/40")}>
                  {createElement(Icon, { className: "size-4" })}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_TONES.map((tone) => (
                <button key={tone} type="button" aria-label={`Colour ${tone}`} title={tone} aria-pressed={value.tone === tone} onClick={() => setValue({ ...value, tone })} className={cn("size-7 rounded-full border border-black/10 transition-shadow", TONE_CLASSES[tone].swatch, value.tone === tone && "ring-2 ring-ring/60 ring-offset-2 ring-offset-background")}>
                  <span className="sr-only">{tone}</span>
                </button>
              ))}
            </div>
          </div>
          <label className={cn("flex items-start gap-2.5", structural && "opacity-60")}>
            <Checkbox checked={value.closed} disabled={structural || pending} onCheckedChange={(on) => { setValue({ ...value, closed: on === true }); setConfirming(false); }} />
            <span>
              <span className="text-sm font-medium">Closes the task</span>
              <span className="block text-[13px] text-muted-foreground">
                {structural
                  ? status.closed
                    ? `“${status.label}” is how a task finishes — it always closes the task.`
                    : `“${status.label}” is work still going on — it never closes the task.`
                  : "Closed tasks leave the board, are never overdue, and moving a task here asks for a reason."}
              </span>
            </span>
          </label>
          {warning !== "" ? (
            <p className="rounded-md border border-status-amber-dot/30 bg-status-amber-bg px-3 py-2 text-[13px] text-status-amber-fg">
              {warning} {confirming ? "Save again to confirm." : "You'll confirm on save."}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => open_(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || !dirty || value.label.trim() === ""}
            onClick={() => {
              if (warning !== "" && !confirming) {
                setConfirming(true);
                return;
              }
              save();
            }}
          >
            {pending ? "Saving…" : warning !== "" && !confirming ? (renames ? "Save — renames it everywhere" : "Save — changes those tasks") : creating ? "Add status" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The archive confirmation, with the count of tasks that keep the status. */
function ArchiveDialog({ status, tasks, onClose }: { status: TaskStatusDef; tasks: number; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive “{status.label}”?</DialogTitle>
          <DialogDescription>
            {tasks > 0 ? `The ${counted(tasks)} with this status keep` : "Any task with this status keeps"} it — it only leaves the pickers, so nothing new can be set to it. Restore it any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={() => startTransition(async () => { if (toastResult(await setStatusArchived({ key: status.key, archived: true }))) onClose(); })}>
            {pending ? "Archiving…" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The delete confirmation for a custom status nothing carries — the only way a status ever goes away. */
function DeleteStatusDialog({ status, onClose }: { status: TaskStatusDef; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{status.label}”?</DialogTitle>
          <DialogDescription>No task has this status, so it can be deleted for good — this can&rsquo;t be undone. Old history lines that mention it will read &ldquo;a removed status&rdquo;. To keep the tasks&rsquo; view of it instead, archive it.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => startTransition(async () => { if (toastResult(await deleteTaskStatus({ key: status.key }))) onClose(); })}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StatusesCard({ statuses, usage }: { statuses: StatusCatalog; usage: Record<string, number> }) {
  const [order, setOrder] = useState(() => statuses.filter((status) => !status.archived).map((status) => status.key));
  const [saved, setSaved] = useState(statuses);
  const [dragged, setDragged] = useState<UniqueIdentifier | null>(null);
  const [dialog, setDialog] = useState<{ kind: "add" } | { kind: "edit" | "archive" | "delete"; status: TaskStatusDef } | null>(null);
  const [pending, startTransition] = useTransition();
  const dndId = useId();
  // After a save the page refreshes with the new catalog — take it as the truth.
  if (statuses !== saved) {
    setSaved(statuses);
    setOrder(statuses.filter((status) => !status.archived).map((status) => status.key));
  }
  const active = order.map((key) => statuses.find((status) => status.key === key)).filter((status) => status !== undefined);
  const archived = statuses.filter((status) => status.archived);
  const dirty = order.join() !== statuses.filter((status) => !status.archived).map((status) => status.key).join();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragEnd = ({ active: item, over }: DragEndEvent) => {
    setDragged(null);
    if (over === null || item.id === over.id) return;
    setOrder(arrayMove(order, order.indexOf(item.id as string), order.indexOf(over.id as string)));
  };

  return (
    <Section
      id="statuses"
      title="Task statuses"
      description="What a task can be set to, in picker order. Rename a status and every task follows. Closed statuses end the task — Completed and Merged always do, and the statuses for work still going on never do. Archive retires a status from the pickers without touching the tasks that have it; Not started and Completed stay."
      action={
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind: "add" })}>
          Add status
        </Button>
      }
    >
      <DndContext id={dndId} sensors={sensors} measuring={measuringConfig} onDragStart={({ active: item }: DragStartEvent) => setDragged(item.id)} onDragEnd={dragEnd} onDragCancel={() => setDragged(null)}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="divide-y">
            {active.map((status) => (
              <SortableStatusRow key={status.key} status={status} tasks={usage[status.key] ?? 0} onEdit={() => setDialog({ kind: "edit", status })} onDelete={() => setDialog({ kind: "delete", status })} onArchive={() => setDialog({ kind: "archive", status })} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={dropAnimationConfig}>{dragged !== null ? <StatusRowOverlay status={statuses.find((status) => status.key === dragged)!} /> : null}</DragOverlay>
      </DndContext>
      {dirty ? (
        <div className="flex justify-end border-t px-4 py-3 sm:px-5">
          <Button type="button" size="sm" disabled={pending} onClick={() => startTransition(async () => void toastResult(await reorderTaskStatuses({ keys: order })))}>
            {pending ? "Saving…" : "Save order"}
          </Button>
        </div>
      ) : null}
      {archived.length > 0 ? (
        <div className="border-t">
          <p className="px-4 pt-3 pb-1 text-[13px] text-muted-foreground sm:px-5">Archived — tasks keep them, but they can&rsquo;t be picked</p>
          <div className="divide-y">
            {archived.map((status) => (
              <div key={status.key} className={cn(rowClass, "opacity-60")}>
                <span className="size-4 shrink-0" aria-hidden />
                <StatusIcon status={status} />
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {status.label}
                  {status.builtin ? <span className="ml-2 text-xs" title="Comes with every workspace — its behaviour is fixed">built-in</span> : null}
                </span>
                <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{(usage[status.key] ?? 0) > 0 ? counted(usage[status.key] ?? 0) : ""}</span>
                {!status.builtin && (usage[status.key] ?? 0) === 0 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDialog({ kind: "delete", status })}>
                    <Trash2 aria-hidden className="size-3.5" />
                    Delete
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => startTransition(async () => void toastResult(await setStatusArchived({ key: status.key, archived: false })))}>
                  <ArchiveRestore aria-hidden className="size-3.5" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {dialog?.kind === "add" ? <StatusDialog key="new" status={null} tasks={0} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "edit" ? <StatusDialog key={dialog.status.key} status={dialog.status} tasks={usage[dialog.status.key] ?? 0} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "archive" ? <ArchiveDialog status={dialog.status} tasks={usage[dialog.status.key] ?? 0} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "delete" ? <DeleteStatusDialog status={dialog.status} onClose={() => setDialog(null)} /> : null}
    </Section>
  );
}
