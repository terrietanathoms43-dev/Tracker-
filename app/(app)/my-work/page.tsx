import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { LocalTasksSection } from "@/components/tasks/local-section";
import { MyWorkDates } from "@/components/tasks/my-work-dates";
import { QuickAddTask } from "@/components/tasks/quick-add-task";
import { SelectionProvider } from "@/components/tasks/selection";
import { TaskSection } from "@/components/tasks/task-section";
import { RECENTLY_FINISHED_DAYS } from "@/lib/constants";
import { myWorkGroups } from "@/lib/dal/tasks";
import { catchUpRecurrences } from "@/lib/dal/recurrence";
import { isLeader, isStakeholder } from "@/lib/permissions";
import { scopedProject } from "@/lib/project-scope-server";
import { describeDateRange, parseFilters, tasksHref } from "@/lib/tasks/filters";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /my-work: the viewer's own work in four groups, narrowed to the navigation's project and, when asked, to a range
// of dates (made, completed or updated between two days: docs/PLAN.md, 2026-11-03 log). The viewer's local tasks
// come first in a Local section of their own, with its own actions, while there are any (2026-11-06 log).

export const metadata: Metadata = { title: "My Work" };

/** How many rows a group shows before "See all". */
const CAP = 10;

/** "Where did I stop, what's next?": my work in four groups, each task in exactly one of them (docs/PLAN.md §5). */
export default async function MyWorkPage(props: PageProps<"/my-work">) {
  const viewer = await requireViewer();
  if (isStakeholder(viewer)) redirect("/home");
  await catchUpRecurrences(viewer);
  const [raw, scope] = await Promise.all([props.searchParams, scopedProject(viewer)]);
  const today = dayKey(new Date(), viewer.timezone);
  const dates = parseFilters(raw);
  const project = scope?.id ?? "";
  const groups = await myWorkGroups(viewer, today, { project, dates });
  const nothing = groups.local.length + groups.attention.length + groups.continueWorking.length + groups.waiting.length + groups.finished.length === 0;
  const range = describeDateRange(dates, today);
  const mine = { assignee: "me" as const };

  return (
    <>
      <PageHeader title="My Work" description={`Where you stopped, and what's next.${scope ? ` In ${scope.name}.` : ""}`} action={<MyWorkDates filters={dates} today={today} />} />
      <QuickAddTask today={today} defaults={scope && scope.status === "active" ? { projectId: scope.id } : {}} />
      {nothing ? (
        <EmptyState
          icon={ListChecks}
          title={range ? "Nothing of yours in those dates" : "Nothing is assigned to you yet"}
          description={range ? `No task assigned to you was ${range.toLowerCase()}. Clear the dates to see everything.` : "Tasks assigned to you show up here, grouped by what needs doing next."}
        />
      ) : (
        <div className="grid gap-8">
        <LocalTasksSection items={groups.local.slice(0, CAP)} total={groups.local.length} today={today} seeAllHref={tasksHref({})} description="Only you can see these; they aren't on the main board. Send them for sign-off when they're ready, or publish them where no sign-off applies." />
        <SelectionProvider canDelete={isLeader(viewer)}>
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
            seeAllHref={tasksHref({ ...mine, status: ["in_progress", "not_started"] })}
            empty="Nothing in progress. Pick something up from the task list, or create a task."
          />
          <TaskSection
            title="Waiting on others"
            description="Blocked, or waiting for an approval."
            items={groups.waiting.slice(0, CAP)}
            total={groups.waiting.length}
            today={today}
            seeAllHref={tasksHref({ ...mine, status: ["awaiting_approval", "blocked"] })}
          />
          <TaskSection
            title={range ? "Finished" : "Recently finished"}
            description={range ? `Completed, ${range.toLowerCase().replace(/^\w+ /, "")}.` : `Completed in the last ${RECENTLY_FINISHED_DAYS} days.`}
            items={groups.finished.slice(0, CAP)}
            total={groups.finished.length}
            today={today}
            seeAllHref={tasksHref({ ...mine, status: ["completed"], sort: "updated", dateField: dates.dateField, from: dates.from, to: dates.to })}
          />
        </div>
        </SelectionProvider>
        </div>
      )}
    </>
  );
}
