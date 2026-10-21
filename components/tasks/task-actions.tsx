"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TaskStatus } from "@/lib/constants";
import type { CreateDefaults } from "@/lib/tasks/types";
import { CommandPalette } from "./command-palette";
import { CreateTaskDialog, TransitionDialog, UpdateProgressDialog } from "./task-dialogs";
import { useShortcuts } from "./use-shortcuts";
import { prefetchTaskFormOptions } from "./use-task-form-options";

// The task actions every screen can reach: New task (N jumps to the page's quick-add bar, or opens the dialog
// where there is none), Update progress (U on a task page), the status
// dialogs and the command palette (⌘K). One provider in app/(app)/layout.tsx owns the dialogs, so a row on
// any page opens the same form.

/** Fired on the task page to scroll to and focus its inline Update progress form. */
export const FOCUS_UPDATE_EVENT = "trackwise:focus-update";

/** The quick-add bar's title field carries this attribute, so N can find it. */
export const QUICK_ADD_ATTRIBUTE = "data-quick-add";

/** Focuses the page's quick-add bar; false when the page has none. */
function focusQuickAdd(): boolean {
  const input = document.querySelector<HTMLInputElement>(`[${QUICK_ADD_ATTRIBUTE}]`);
  if (input === null) return false;
  input.scrollIntoView({ block: "nearest" });
  input.focus();
  return true;
}

export type TaskActions = {
  /** `onCreated` runs once the dialog has created the task (the quick-add bar clears itself then). */
  openCreate: (defaults?: CreateDefaults, onCreated?: (id: string) => void) => void;
  openUpdate: (taskId: string) => void;
  openTransition: (taskId: string, status: TaskStatus) => void;
  openPalette: () => void;
  /** The task whose page is open and which the viewer may update (registered by <CurrentTask>). */
  currentTaskId: string | null;
  setCurrentTask: (taskId: string | null) => void;
};

const TaskActionsContext = createContext<TaskActions | null>(null);

/** The task actions; any client component under the app shell may call them. */
export function useTaskActions(): TaskActions {
  const value = use(TaskActionsContext);
  if (value === null) throw new Error("useTaskActions must be used inside TaskActionsProvider");
  return value;
}

/** Rendered by the task page so U and the palette know which task is open (reading the URL here would block prerendering). */
export function CurrentTask({ id }: { id: string }) {
  const { setCurrentTask } = useTaskActions();
  useEffect(() => {
    setCurrentTask(id);
    return () => setCurrentTask(null);
  }, [id, setCurrentTask]);
  return null;
}

export function TaskActionsProvider({ children }: { children: ReactNode }) {
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [create, setCreate] = useState<{ open: boolean; defaults: CreateDefaults; onCreated?: (id: string) => void }>({ open: false, defaults: {} });
  const [updateTaskId, setUpdateTaskId] = useState<string | null>(null);
  const [transition, setTransition] = useState<{ taskId: string; status: TaskStatus } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // The New task dialog's pickers are fetched once the page is idle, so the first N opens a ready form.
  useEffect(() => {
    const timer = window.setTimeout(prefetchTaskFormOptions, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const openUpdate = useCallback(
    (taskId: string) => {
      // On the task's own page the inline form is the place to write it.
      if (taskId === currentTaskId && document.getElementById("update-progress")) window.dispatchEvent(new Event(FOCUS_UPDATE_EVENT));
      else setUpdateTaskId(taskId);
    },
    [currentTaskId],
  );

  const actions = useMemo<TaskActions>(
    () => ({
      openCreate: (defaults = {}, onCreated) => setCreate({ open: true, defaults, onCreated }),
      openUpdate,
      openTransition: (taskId, status) => setTransition({ taskId, status }),
      openPalette: () => setPaletteOpen(true),
      currentTaskId,
      setCurrentTask: setCurrentTaskId,
    }),
    [openUpdate, currentTaskId],
  );

  useShortcuts({
    onCreate: () => {
      if (!focusQuickAdd()) setCreate({ open: true, defaults: {} });
    },
    onUpdate: () => {
      if (currentTaskId) openUpdate(currentTaskId);
    },
    onPalette: () => setPaletteOpen((open) => !open),
  });

  return (
    <TaskActionsContext value={actions}>
      {children}
      <CreateTaskDialog
        open={create.open}
        defaults={create.defaults}
        onCreated={create.onCreated}
        onClose={() => setCreate({ open: false, defaults: {} })}
      />
      <UpdateProgressDialog taskId={updateTaskId} onClose={() => setUpdateTaskId(null)} />
      <TransitionDialog target={transition} onClose={() => setTransition(null)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </TaskActionsContext>
  );
}
