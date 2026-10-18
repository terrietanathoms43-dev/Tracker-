import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { TaskSection } from "@/components/tasks/task-section";
import { RECENTLY_FINISHED_DAYS } from "@/lib/constants";
import { myWorkGroups } from "@/lib/dal/tasks";
import { isStakeholder } from "@/lib/permissions";
import { tasksHref } from "@/lib/tasks/filters";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /my-work: the viewer's own work in four groups.

export const metadata: Metadata = { title: "My Work" };

/** How many rows a group shows before "See all". */
const CAP = 10;

/** "Where did I stop, what's next?": my work in four groups, each task in exactly one of them (docs/PLAN.md §5). */
export default async function MyWorkPage() {
  const viewer = await requireViewer();
  if (isStakeholder(viewer)) redirect("/home");
  const today = dayKey(new Date(), viewer.timezone);
  const groups = await myWorkGroups(viewer, today);
  const nothing = groups.attention.length + groups.continueWorking.length + groups.waiting.length + groups.finished.length === 0;

  return (
    <>
      <PageHeader title="My Work" description="Where you stopped, and what's next." action={<NewTaskButton />} />
      {nothing ? (
        <EmptyState
          icon={ListChecks}
          title="Nothing is assigned to you yet"
          description="Tasks assigned to you, or to a team you're in, show up here, grouped by what needs doing next."
          action={<NewTaskButton variant="outline" />}
        />
      ) : (
        <div className="grid gap-8">
          <TaskSection
            title="Needs attention"
            description="Overdue, due soon, blocked, sent back, or waiting for your approval."
            items={groups.attention.slice(0, CAP)}
            total={groups.attention.length}
            today={today}
          />
          <TaskSection
            title="Continue working"
            items={groups.continueWorking.slice(0, CAP)}
            total={groups.continueWorking.length}
            today={today}
            seeAllHref={tasksHref({ assignee: "me", status: ["in_progress", "not_started"] })}
            empty="Nothing in progress. Pick something up from the task list, or create a task."
          />
          <TaskSection
            title="Waiting on others"
            description="Blocked, or waiting for an approval."
            items={groups.waiting.slice(0, CAP)}
            total={groups.waiting.length}
            today={today}
            seeAllHref={tasksHref({ assignee: "me", status: ["awaiting_approval", "blocked"] })}
          />
          <TaskSection
            title="Recently finished"
            description={`Completed in the last ${RECENTLY_FINISHED_DAYS} days.`}
            items={groups.finished.slice(0, CAP)}
            total={groups.finished.length}
            today={today}
            seeAllHref={tasksHref({ assignee: "me", status: ["completed"], sort: "updated" })}
          />
        </div>
      )}
    </>
  );
}
