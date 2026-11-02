"use client";

import { cn } from "cn";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import type { ReportProjectOption } from "@/lib/reports/data";
import { reportHref, type ReportCut, type ReportProject } from "@/lib/reports/params";
import type { ReportRange } from "@/lib/reports/range";

// Which project the report is about (docs/PLAN.md, 2026-11-01 log). One picker beside the date presets; choosing
// writes `?project=` to the address, so every section, the chart and the CSV files narrow together and the report
// can still be shared as a link. On, it wears the same tint as a narrowing task filter.

/** The same tint the task toolbar gives a picker that narrows the list, so "on" is unmistakable. */
const ACTIVE = "[&>select]:border-primary [&>select]:bg-sidebar-accent [&>select]:font-medium [&>select]:text-foreground";

export function ProjectSelect({ options, value, range, cut }: { options: ReportProjectOption[]; value: ReportProject; range: ReportRange; cut: ReportCut }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = options.filter((option) => option.status === "active");
  const closed = options.filter((option) => option.status !== "active");
  // An id the workspace doesn't have reads as "All projects", which is what the report then shows.
  const known = value === "" || value === "none" || options.some((option) => option.id === value) ? value : "";

  return (
    <NativeSelect
      aria-label="Project"
      data-print-hide
      value={known}
      disabled={pending}
      onChange={(event) => {
        const project = event.target.value;
        startTransition(() => router.replace(reportHref("/reports", range, { cut, project }), { scroll: false }));
      }}
      className={cn("w-full sm:w-56", known !== "" && ACTIVE, pending && "opacity-70")}
    >
      <option value="">All projects</option>
      <option value="none">No project</option>
      {active.length > 0 ? (
        <optgroup label="Active">
          {active.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </optgroup>
      ) : null}
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
