"use client";

import { cn } from "cn";
import { ArrowLeft, Link2, NotebookPen } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { editTask } from "@/actions/tasks";
import { CharacterCounter } from "@/components/character-counter";
import { PriorityGlyph } from "@/components/priority-glyph";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LIMITS } from "@/lib/limits";
import type { TaskAbilities, TaskDetail } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";
import { AssigneeStack } from "../assignee-stack";
import { DueLabel } from "../due-label";
import { FOCUS_UPDATE_EVENT } from "../task-actions";

// The task page header: back link, title (editable), copy link, and a one-line summary.

/** The title, editable in place for people who may edit: Enter saves, Escape cancels. */
function TitleEditor({ detail, editable }: { detail: TaskDetail; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(detail.title);
  const [pending, startTransition] = useTransition();
  const save = () => {
    const next = value.trim();
    setEditing(false);
    if (next === "" || next === detail.title) return setValue(detail.title);
    startTransition(async () => {
      if (!toastResult(await editTask({ taskId: detail.id, field: "title", value: next }))) setValue(detail.title);
    });
  };
  if (editing) {
    return (
      <div>
        <Input
          aria-label="Title"
          value={value}
          autoFocus
          maxLength={LIMITS.taskTitle}
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") {
              setValue(detail.title);
              setEditing(false);
            }
          }}
          className="h-auto py-1 text-lg font-semibold md:text-xl"
        />
        <div className="mt-1 flex justify-end">
          <CharacterCounter value={value} max={LIMITS.taskTitle} />
        </div>
      </div>
    );
  }
  const title = <span className={cn(detail.status === "rejected" && "text-muted-foreground line-through", pending && "opacity-60")}>{value}</span>;
  return (
    <h1 className="text-xl leading-snug font-semibold tracking-tight md:text-2xl">
      {editable ? (
        <button type="button" className="rounded-md text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setEditing(true)} title="Click to edit the title">
          {title}
        </button>
      ) : (
        title
      )}
    </h1>
  );
}

/** What this is and who holds it, at a glance: title, status, assignee, due date and priority. */
export function TaskHeader({ detail, abilities, today }: { detail: TaskDetail; abilities: TaskAbilities; today: string }) {
  // A stakeholder follows a task from their request; the task list isn't theirs to browse.
  const back = !abilities.progress && detail.request ? { href: `/requests/${detail.request.id}`, label: "Request" } : { href: "/home?view=list", label: "Tasks" };
  return (
    <header className="mb-5">
      <Link href={back.href} className="inline-flex items-center gap-1.5 rounded-md text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {back.label}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <TitleEditor key={detail.title} detail={detail} editable={abilities.edit} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    toast.success("Link copied.");
                  } catch {
                    toast.error("Couldn't copy the link. Copy it from the address bar instead.");
                  }
                }}
              >
                <Link2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy link</TooltipContent>
          </Tooltip>
          {abilities.progress ? (
            <Button variant="outline" className="hidden sm:inline-flex" onClick={() => window.dispatchEvent(new Event(FOCUS_UPDATE_EVENT))}>
              <NotebookPen aria-hidden />
              Update progress
              <kbd className="ml-1 hidden rounded border border-current/20 px-1 font-sans text-[11px] opacity-60 sm:inline">U</kbd>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
        <StatusBadge status={detail.status} />
        {detail.assignees.length > 0 ? (
          <AssigneeStack assignees={detail.assignees} names />
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-5 rounded-full border border-dashed" aria-hidden />
            <span className="text-foreground">Unassigned</span>
          </span>
        )}
        {detail.dueDate ? (
          <span>
            Due <DueLabel due={detail.dueDate} today={today} status={detail.status} />
          </span>
        ) : null}
        {detail.priority !== "normal" ? (
          <span className="inline-flex items-center gap-1">
            <PriorityGlyph priority={detail.priority} className="size-3.5" />
            {detail.priority === "low" ? "Low priority" : detail.priority === "high" ? "High priority" : "Urgent"}
          </span>
        ) : null}
      </div>
    </header>
  );
}
