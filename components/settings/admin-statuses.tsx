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
import { Archive, ArchiveRestore, GripVertical, Pencil } from "lucide-react";
import { createElement, useId, useState, useTransition } from "react";
import { reorderTaskStatuses, saveTaskStatus, setStatusArchived } from "@/actions/config";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATUS_ICONS, STATUS_TONES, TONE_CLASSES, type StatusCatalog, type StatusTone, type TaskStatusDef } from "@/lib/statuses";
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
const lockedClosed = (status: TaskStatusDef) => status.kind === "completed" || status.kind === "merged";

/** One status row: the grab surface, its icon and label, how many tasks carry it, Edit and Archive. */
function SortableStatusRow({ status, tasks, onEdit, onArchive }: { status: TaskStatusDef; tasks: number; onEdit: () => void; onArchive: () => void }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id: status.key, animateLayoutChanges });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(rowClass, "group touch-none select-none", isDragging ? "z-10 cursor-grabbing opacity-40" : "cursor-grab")} {...attributes} {...listeners}>
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <StatusIcon status={status} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {status.label}
        {status.closed ? <span className="ml-2 text-xs font-normal text-muted-foreground">closes the task</span> : null}
      </span>
      <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{tasks > 0 ? `${tasks} ${plural(tasks)}` : ""}</span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${status.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={onEdit}>
        <Pencil aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Archive ${status.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={onArchive}>
        <Archive aria-hidden />
      </Button>
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
function StatusDialog({ status, onClose }: { status: TaskStatusDef | null; onClose: () => void }) {
  const creating = status === null;
  const original: Draft = creating ? { label: "", icon: "circle", tone: "not_started", closed: false } : { label: status.label, icon: status.icon, tone: status.tone, closed: status.closed };
  const [value, setValue] = useState<Draft>(original);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const renames = !creating && value.label.trim() !== "" && value.label.trim() !== original.label;
  const dirty = creating ? value.label.trim() !== "" : renames || value.icon !== original.icon || value.tone !== original.tone || value.closed !== original.closed;
  const structural = !creating && lockedClosed(status);

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
                <button key={key} type="button" aria-label={`Icon ${key}`} aria-pressed={value.icon === key} onClick={() => setValue({ ...value, icon: key })} className={cn("grid size-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:text-foreground", value.icon === key && "border-ring bg-accent text-foreground ring-2 ring-ring/40")}>
                  {createElement(Icon, { className: "size-4" })}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_TONES.map((tone) => (
                <button key={tone} type="button" aria-label={`Colour ${tone.replaceAll("_", " ")}`} aria-pressed={value.tone === tone} onClick={() => setValue({ ...value, tone })} className={cn("size-7 rounded-full border transition-shadow", TONE_CLASSES[tone].dot, value.tone === tone && "ring-2 ring-ring/60 ring-offset-2 ring-offset-background")}>
                  <span className="sr-only">{tone}</span>
                </button>
              ))}
            </div>
          </div>
          <label className={cn("flex items-start gap-2.5", structural && "opacity-60")}>
            <Checkbox checked={structural ? true : value.closed} disabled={structural || pending} onCheckedChange={(on) => setValue({ ...value, closed: on === true })} />
            <span>
              <span className="text-sm font-medium">Closes the task</span>
              <span className="block text-[13px] text-muted-foreground">
                {structural ? `"${status.label}" is how a task finishes — always closed.` : "Closed tasks leave the board, are never overdue, and this asks for a reason."}
              </span>
            </span>
          </label>
          {renames ? <p className="rounded-md border border-status-awaiting-dot/30 bg-status-awaiting-bg px-3 py-2 text-[13px] text-status-awaiting-fg">Renames it on every task that has it — {confirming ? "sure?" : "you'll confirm on save."}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => open_(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || !dirty || value.label.trim() === ""}
            onClick={() => {
              if (renames && !confirming) {
                setConfirming(true);
                return;
              }
              save();
            }}
          >
            {pending ? "Saving…" : renames && !confirming ? "Save — renames it everywhere" : creating ? "Add status" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The archive confirmation, with the count of tasks that keep the status. */
function ArchiveDialog({ status, tasks, open, onClose }: { status: TaskStatusDef | null; open: boolean; tasks: number; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  if (status === null) return null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive “{status.label}”?</DialogTitle>
          <DialogDescription>
            {tasks > 0 ? `The ${tasks} ${plural(tasks)} with this status keep` : "Any task with this status keeps"} it — it only leaves the pickers, so nothing new can be set to it. Restore it any time.
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

export function StatusesCard({ statuses, usage }: { statuses: StatusCatalog; usage: Record<string, number> }) {
  const [order, setOrder] = useState(() => statuses.filter((status) => !status.archived).map((status) => status.key));
  const [saved, setSaved] = useState(statuses);
  const [dragged, setDragged] = useState<UniqueIdentifier | null>(null);
  const [dialog, setDialog] = useState<{ kind: "edit" | "add"; status: TaskStatusDef | null } | { kind: "archive"; status: TaskStatusDef } | null>(null);
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
      description="What a task can be set to, in picker order. Rename a status and every task follows; closed statuses end the task — Completed and Merged always do. Archive retires a status from the pickers without touching the tasks that have it."
      action={
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind: "add", status: null })}>
          Add status
        </Button>
      }
    >
      <DndContext id={dndId} sensors={sensors} measuring={measuringConfig} onDragStart={({ active: item }: DragStartEvent) => setDragged(item.id)} onDragEnd={dragEnd} onDragCancel={() => setDragged(null)}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="divide-y">
            {active.map((status) => (
              <SortableStatusRow key={status.key} status={status} tasks={usage[status.key] ?? 0} onEdit={() => setDialog({ kind: "edit", status })} onArchive={() => setDialog({ kind: "archive", status })} />
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
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{status.label}</span>
                <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{(usage[status.key] ?? 0) > 0 ? `${usage[status.key]} ${plural(usage[status.key] ?? 0)}` : ""}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => startTransition(async () => void toastResult(await setStatusArchived({ key: status.key, archived: false })))}>
                  <ArchiveRestore aria-hidden className="size-3.5" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {dialog?.kind === "add" ? <StatusDialog key="new" status={null} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "edit" && dialog.status ? <StatusDialog key={dialog.status.key} status={dialog.status} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "archive" ? <ArchiveDialog status={dialog.status} tasks={usage[dialog.status.key] ?? 0} open onClose={() => setDialog(null)} /> : null}
    </Section>
  );
}
