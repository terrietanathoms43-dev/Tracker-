"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setProjectPins } from "@/actions/projects";
import { ProjectPicker } from "@/components/projects/project-picker";
import type { ProjectOption } from "@/lib/dal/projects";
import { projectScopeCookie, type ProjectScope } from "@/lib/project-scope";

// The one project picker (docs/PLAN.md, 2026-11-03 and 2026-11-04 logs): under the workspace switcher on a
// desktop, an icon in the phone's top bar. Choosing a project narrows every work screen (lists, board, My Work,
// Goals, Reports, Proposals) and the add bar's default project until "All projects" is chosen again. The choice
// lives in a browser cookie, like the /home tab order; the server pages read it, so a refresh is all it takes.
// Pins are the person's, saved on the server, so every picker on every device shows the same order.

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
  const savePins = (projectIds: string[]) =>
    startTransition(async () => {
      const result = await setProjectPins({ projectIds });
      if (!result.ok) toast.error(result.error);
    });
  return { current, choose, savePins, pending };
}

/** The sidebar's picker (`variant="nav"`) or the phone top bar's icon (`variant="icon"`): the same list behind both. */
export function ProjectScopePicker({ options, pinned, value, variant }: { options: ProjectOption[]; pinned: string[]; value: ProjectScope; variant: "nav" | "icon" }) {
  const { current, choose, savePins, pending } = useScope(value);
  if (options.length === 0) return null;
  return (
    <ProjectPicker
      label="Project"
      trigger={variant}
      value={current}
      onChange={choose}
      options={options}
      pinned={pinned}
      onPinsChange={savePins}
      noneLabel="All projects"
      includeClosed
      disabled={false}
      className={pending ? "opacity-70" : undefined}
      triggerProps={variant === "nav" ? { "data-project-scope": "" } : { "data-project-scope-button": "" }}
    />
  );
}
