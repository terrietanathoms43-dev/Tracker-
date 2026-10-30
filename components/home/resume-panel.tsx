import Link from "next/link";
import { TaskList } from "@/components/tasks/task-list";
import { Panel, PanelEmpty } from "@/components/dashboard/panel";
import type { TaskListItem } from "@/lib/tasks/types";

// "Pick up where you left off": the first few of My Work's actionable tasks, with the reason each is there.

/** How many tasks Home shows from My Work. */
export const RESUME_ROWS = 5;

/** `tasks` is the whole actionable list (lib/dal/tasks.ts myWorkTasks); the panel shows the first five. */
export function ResumePanel({ tasks, today }: { tasks: TaskListItem[]; today: string }) {
  return (
    <Panel title="Pick up where you left off" href="/my-work" hrefLabel={tasks.length > RESUME_ROWS ? `All ${tasks.length} in My Work` : "My Work"}>
      {tasks.length === 0 ? (
        <PanelEmpty>
          Nothing assigned to you needs doing right now.{" "}
          <Link href="/home?view=list" className="text-link underline-offset-4 hover:underline">
            Browse the open tasks
          </Link>
          .
        </PanelEmpty>
      ) : (
        <TaskList page={{ items: tasks.slice(0, RESUME_ROWS), nextCursor: null }} today={today} showReason />
      )}
    </Panel>
  );
}
