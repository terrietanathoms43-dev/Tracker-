import { cn } from "cn";
import Link from "next/link";

// The secondary tab row under the Tasks header (docs/PLAN.md §2): List · Board · Projects. The active tab's
// underline is one of the few places the gold highlight appears (PLAN §9).

export type TasksTab = "list" | "board" | "projects";

/**
 * List and Board keep the current filters (`query`, without `view`) so switching keeps the same tasks in view.
 * The projects page renders it too, with `active="projects"`.
 */
export function ViewTabs({ active, query = "" }: { active: TasksTab; query?: string }) {
   const tabs: { key: TasksTab; label: string; href: string }[] = [
      { key: "list", label: "List", href: query ? `/tasks?${query}` : "/tasks" },
      { key: "board", label: "Board", href: query ? `/tasks?${query}&view=board` : "/tasks?view=board" },
      { key: "projects", label: "Projects", href: "/projects" },
   ];
   return (
      <nav aria-label="Task views" className="-mt-2 mb-5 flex gap-5 border-b">
         {tabs.map((tab) => {
            const on = tab.key === active;
            return (
               <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                     "relative -mb-px flex h-9 items-center border-b-2 text-base font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                     on ? "border-highlight text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
               >
                  {tab.label}
               </Link>
            );
         })}
      </nav>
   );
}
