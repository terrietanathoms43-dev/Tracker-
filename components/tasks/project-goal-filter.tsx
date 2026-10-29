"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/native-select";

/**
 * Two-option selection for Project and Goal filtering at the top level.
 * Defaults to "All projects" and "All goals" (where unlinked tasks always show).
 */
export function ProjectGoalFilter({
  projects,
  goals,
  currentProject = "",
  currentGoal = "",
  className = "",
}: {
  projects: { id: string; name: string }[];
  goals: { id: string; title: string }[];
  currentProject?: string;
  currentGoal?: string;
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = (key: "project" | "goal", value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-70" : ""} ${className}`}>
      <NativeSelect
        aria-label="Filter by project"
        value={currentProject}
        onChange={(e) => apply("project", e.target.value)}
        className="w-36 text-xs sm:w-44 sm:text-sm"
      >
        <option value="">All projects</option>
        <option value="none">Unlinked (no project)</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label="Filter by goal"
        value={currentGoal}
        onChange={(e) => apply("goal", e.target.value)}
        className="w-36 text-xs sm:w-44 sm:text-sm"
      >
        <option value="">All goals</option>
        <option value="none">Unlinked (no goal)</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
