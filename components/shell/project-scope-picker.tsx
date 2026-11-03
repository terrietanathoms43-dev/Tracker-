"use client";

import { cn } from "cn";
import { Check, FolderKanban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ProjectOption } from "@/lib/dal/projects";
import { projectScopeCookie, type ProjectScope } from "@/lib/project-scope";

// The one project picker (docs/PLAN.md, 2026-11-03 log): under the workspace switcher on a desktop, an icon in
// the phone's top bar. Choosing a project narrows every work screen (lists, board, My Work, Goals, Reports,
// Proposals) and the add bar's default project until "All projects" is chosen again. The choice lives in a
// browser cookie, like the /home tab order; the server pages read it, so a refresh is all it takes.

function useScope(value: ProjectScope) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setCurrent(value);
  }
  const choose = (next: ProjectScope) => {
    setCurrent(next);
    document.cookie = projectScopeCookie(next);
    startTransition(() => router.refresh());
  };
  return { current, choose, pending };
}

/** The same tint the task toolbar gives a filter that narrows the list, so a chosen project is unmistakable. */
const ACTIVE = "[&>select]:border-primary [&>select]:bg-sidebar-accent [&>select]:font-medium [&>select]:text-foreground";

/** The sidebar's picker: a native select, "All projects" first, closed projects grouped after the active ones. */
export function ProjectScopeSelect({ options, value }: { options: ProjectOption[]; value: ProjectScope }) {
  const { current, choose, pending } = useScope(value);
  const active = options.filter((option) => option.status === "active");
  const closed = options.filter((option) => option.status !== "active");
  if (options.length === 0) return null;
  return (
    <NativeSelect aria-label="Project" data-project-scope value={current} disabled={pending} onChange={(event) => choose(event.target.value)} className={cn("w-full", current !== "" && ACTIVE, pending && "opacity-70")}>
      <option value="">All projects</option>
      {active.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
      {closed.length > 0 ? (
        <optgroup label="Completed and archived">
          {closed.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </NativeSelect>
  );
}

/** The phone's picker: a folder icon (tinted when a project is chosen) that opens a sheet of projects. */
export function ProjectScopeButton({ options, value }: { options: ProjectOption[]; value: ProjectScope }) {
  const { current, choose, pending } = useScope(value);
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  const chosen = options.find((option) => option.id === current) ?? null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={chosen ? `Project: ${chosen.name}` : "Project: all projects"}
        data-project-scope-button
        className={cn("grid size-9 place-items-center rounded-md transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring", chosen ? "bg-sidebar-accent text-primary" : "text-muted-foreground hover:text-foreground", pending && "opacity-70")}
      >
        <FolderKanban className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <SheetHeader>
          <SheetTitle>Project</SheetTitle>
          <SheetDescription>Narrow every screen to one project, or see all of them.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-4">
          {[{ id: "", name: "All projects", status: "active" as const }, ...options].map((option) => {
            const on = option.id === current;
            return (
              <button
                key={option.id || "all"}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  choose(option.id);
                  setOpen(false);
                }}
                className={cn("flex h-11 items-center gap-3 rounded-md px-3 text-left text-base font-medium hover:bg-accent", on && "bg-sidebar-accent text-primary")}
              >
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                {option.status !== "active" ? <span className="text-[12px] text-muted-foreground">{option.status}</span> : null}
                {on ? <Check className="size-4" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
