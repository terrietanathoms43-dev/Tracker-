import type { ReactNode } from "react";
import { ProjectCard } from "@/components/projects/project-parts";
import type { ProjectListItem } from "@/lib/dal/projects";

// The Projects section of a goal page: every project that rolls up into the goal, each with its own progress.

/** The goal's projects as cards (closed ones included, after the active ones), with `action` beside the heading. */
export function GoalProjects({ projects, today, action }: { projects: ProjectListItem[]; today: string; action?: ReactNode }) {
  return (
    <section aria-labelledby="projects-heading" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="projects-heading" className="flex items-baseline gap-2 text-base font-semibold">
          Projects
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{projects.length}</span>
        </h2>
        {action}
      </div>
      {projects.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card px-4 py-5 text-sm text-muted-foreground">No projects roll up into this goal yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} today={today} showGoal={false} />
          ))}
        </ul>
      )}
    </section>
  );
}
