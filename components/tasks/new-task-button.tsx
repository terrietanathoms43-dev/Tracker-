"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CreateDefaults } from "@/lib/tasks/types";
import { useTaskActions } from "./task-actions";

// The New task button every page header uses; it opens the shared create dialog.

/**
 * Opens the New task dialog (the same one N opens). A project or goal page passes `defaults` so the task starts
 * in it. Shows the N shortcut on wider screens.
 */
export function NewTaskButton({ variant = "default", defaults, className }: { variant?: "default" | "outline"; defaults?: CreateDefaults; className?: string }) {
  const { openCreate } = useTaskActions();
  return (
    <Button variant={variant} className={className} onClick={() => openCreate(defaults)}>
      <Plus aria-hidden />
      New task
      <kbd className="ml-1 hidden rounded border border-current/20 px-1 font-sans text-[10px] opacity-60 sm:inline">N</kbd>
    </Button>
  );
}
