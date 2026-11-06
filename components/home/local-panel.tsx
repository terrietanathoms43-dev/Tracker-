import { LocalTasksSection } from "@/components/tasks/local-section";
import type { TaskListItem } from "@/lib/tasks/types";

// Home's Local section (docs/PLAN.md, 2026-11-06 log): the viewer's own local tasks, newest first, while there are
// any. The first few here; the rest under My Work.

/** How many local tasks Home shows. */
const LOCAL_ROWS = 5;

/** `tasks` is the whole list (lib/dal/tasks.ts localTasksFor); the panel shows the first five. Nothing without any. */
export function LocalPanel({ tasks, today }: { tasks: TaskListItem[]; today: string }) {
  if (tasks.length === 0) return null;
  return <LocalTasksSection items={tasks.slice(0, LOCAL_ROWS)} total={tasks.length} today={today} seeAllHref="/my-work" description="Only you can see these; they aren't on the main board yet. Send them for sign-off when they're ready." />;
}
