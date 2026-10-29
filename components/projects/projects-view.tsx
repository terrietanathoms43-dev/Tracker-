import { FolderKanban } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ShowAllToggle } from "@/components/goals/show-all-toggle";
import { ViewTabs } from "@/components/home/view-tabs";
import { PageHeader } from "@/components/page-header";
import { ProjectCard } from "@/components/projects/project-parts";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { activeGoalOptions, ownerOptions } from "@/lib/dal/goals";
import { listProjects } from "@/lib/dal/projects";
import type { HomeTabConfig } from "@/lib/home-tabs";
import { canManagePlanning, type Viewer } from "@/lib/permissions";
import { dayKey } from "@/lib/time";

// The Projects tab of /home: the workspace's projects with their progress.

/**
 * "Find the project": active projects first; completed and archived ones behind `?all=1` once there are any.
 * Leaders and admins get New project; members read; stakeholders never reach this tab.
 */
export async function ProjectsView({ viewer, showAll, tabsConfig }: { viewer: Viewer; showAll: boolean; tabsConfig: HomeTabConfig }) {
  const manage = canManagePlanning(viewer);
  // A workspace has a handful of projects: read them all once, so the toggle knows whether anything closed exists.
  const [projects, people, goals] = await Promise.all([
    listProjects(viewer, { includeClosed: true }),
    manage ? ownerOptions(viewer) : [],
    manage ? activeGoalOptions(viewer) : [],
  ]);
  const today = dayKey(new Date(), viewer.timezone);
  const closedCount = projects.filter((project) => project.status !== "active").length;
  const shown = showAll ? projects : projects.filter((project) => project.status === "active");
  const newProject = (variant: "default" | "outline") => (manage ? <ProjectDialog people={people} goals={goals} viewerId={viewer.userId} variant={variant} /> : null);

  return (
    <>
      <PageHeader title="Projects" action={newProject("default")} />
      <ViewTabs active="projects" config={tabsConfig} />
      {closedCount > 0 ? (
        <div className="-mt-2 mb-3 flex justify-end">
          <ShowAllToggle path="/home?view=projects" checked={showAll} label="Show completed and archived" />
        </div>
      ) : null}
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={manage ? "A project groups related tasks and can roll up into a goal. Create the first one." : "When a leader creates one, it shows up here with its progress."}
          action={newProject("outline")}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No active projects" description="Turn on Show completed and archived to see the rest." action={newProject("outline")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((project) => (
            <ProjectCard key={project.id} project={project} today={today} />
          ))}
        </ul>
      )}
    </>
  );
}
