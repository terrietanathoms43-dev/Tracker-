"use client";

import { useEffect, useState } from "react";
import { getUpdateContext } from "@/actions/tasks";
import type { UpdateContext } from "@/lib/tasks/types";

// Loads one task's update context for the dialogs that need it.

type State = { taskId: string; context: UpdateContext | null; error: string | null };

/** Loads what the update and status dialogs need about one task, once each time a dialog opens for it. */
export function useUpdateContext(taskId: string | null): State | null {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    if (taskId === null) return;
    let live = true;
    getUpdateContext({ taskId }).then((result) => {
      if (live) setState({ taskId, context: result.ok ? result.data : null, error: result.ok ? null : result.error });
    });
    return () => {
      live = false;
    };
  }, [taskId]);
  return state !== null && state.taskId === taskId ? state : null;
}
