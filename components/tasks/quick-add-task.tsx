"use client";

import { cn } from "cn";
import { AudioLines, CalendarDays, ChevronDown, ChevronUp, Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { createTask } from "@/actions/tasks";
import { CharacterCounter } from "@/components/character-counter";
import { GoalPicker } from "@/components/goals/goal-picker";
import { ProjectPicker } from "@/components/projects/project-picker";
import { Button } from "@/components/ui/button";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { nameOf } from "@/lib/tasks/people";
import { activeToken, mentionTargets, parseQuickAdd, removeTokens, suggest, type QuickAddParse, type QuickAddToken } from "@/lib/tasks/quick-add";
import type { CreateDefaults, TaskFormOptions } from "@/lib/tasks/types";
import { addDays } from "@/lib/time";
import { AssigneePicker } from "./assignee-picker";
import { QUICK_ADD_ATTRIBUTE, useTaskActions } from "./task-actions";
import { loadTaskFormOptions, useTaskFormOptions } from "./use-task-form-options";

// The always-open add bar at the top of Home, My Work, Tasks and the project and goal pages: type a title, press
// Enter. Priority, due date, project and assignees sit in an options row under the title (open by default; "Hide
// options" folds it away and the choice is remembered in this browser) or are typed into the title
// (lib/tasks/quick-add.ts); "More options" carries everything over to the full New task dialog.

/** Where the folded / unfolded state of the options row is kept, per browser. */
const OPTIONS_KEY = "trackwise.quickAdd.options";

const optionListeners = new Set<() => void>();

/** The folded state is external to React (storage), so it is read through useSyncExternalStore, not an effect. */
function subscribeOptions(listener: () => void): () => void {
  optionListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    optionListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Open unless this browser folded it; storage that cannot be read counts as open. */
function readOptionsOpen(): boolean {
  try {
    return window.localStorage.getItem(OPTIONS_KEY) !== "closed";
  } catch {
    return true;
  }
}

function writeOptionsOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPTIONS_KEY, open ? "open" : "closed");
  } catch {
    /* not remembered; the page-level override keeps the choice */
  }
  for (const listener of optionListeners) listener();
}

const PRIORITIES: { value: TaskPriority; dot: string }[] = [
  { value: "urgent", dot: "bg-priority-urgent" },
  { value: "high", dot: "bg-priority-high" },
  { value: "normal", dot: "bg-muted-foreground/60" },
  { value: "low", dot: "bg-priority-low/50" },
];

const SHORTCUT_HINTS = ["!high", "!low", "@today", "@tomorrow", "@name"];

const chip = "rounded border bg-muted/60 px-1 py-px font-mono text-[12px] text-foreground/80";

function Toggle({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[5px] px-2.5 text-[14px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-accent text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** People by name, "You" for the viewer: "Sam Dev, You". */
/** You, when you are someone work can go to; a stakeholder proposes, and nobody is assigned until it is signed off. */
const selfAssignable = (options: TaskFormOptions | null): options is TaskFormOptions =>
  options !== null && options.people.some((person) => person.id === options.viewerId);

function namesOf(ids: string[], options: TaskFormOptions | null): string[] {
  if (options === null) return [];
  return ids.map((id) => (id === options.viewerId ? "You" : nameOf(options.people.find((person) => person.id === id))));
}

/**
 * The quick-add bar. Untouched, a task is yours, normal priority, no due date, in the page's project or goal.
 * Typed shortcuts win over the buttons; pressing a button takes the matching shortcut out of the title.
 */
export function QuickAddTask({ today, defaults = {}, className }: { today: string; defaults?: CreateDefaults; className?: string }) {
  const router = useRouter();
  const { openCreate } = useTaskActions();
  const { options } = useTaskFormOptions();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [due, setDue] = useState("");
  const [projectId, setProjectId] = useState(defaults.projectId ?? "");
  const [goalId, setGoalId] = useState(defaults.goalId ?? "");
  /** People chosen in the picker; null until it is touched, when the task is yours (or whoever the title mentions). */
  const [picked, setPicked] = useState<string[] | null>(defaults.assigneeIds ?? null);
  /** The options row: open by default, folded away when this browser last chose so (kept in localStorage). */
  const remembered = useSyncExternalStore(subscribeOptions, readOptionsOpen, () => true);
  /** A choice made in a browser that refuses storage still applies for this page. */
  const [override, setOverride] = useState<boolean | null>(null);
  const optionsOpen = override ?? remembered;
  const [highlight, setHighlight] = useState(0);
  /** Escape hides the suggestions until the next keystroke. */
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleOptions(next: boolean) {
    setOverride(next);
    writeOptionsOpen(next);
  }

  const targets = useMemo(() => (options ? mentionTargets(options.people) : []), [options]);
  const parsed = parseQuickAdd(text, targets);
  const tomorrow = addDays(today, 1);
  const effectivePriority = parsed.priority ?? priority;
  const effectiveDue = parsed.due === "today" ? today : parsed.due === "tomorrow" ? tomorrow : due;
  /** Typed mentions win, then the picker, then you. */
  const me = selfAssignable(options) ? [options.viewerId] : [];
  const effectiveAssignees = parsed.people.length > 0 ? parsed.people : (picked ?? me);
  const explicitAssignees = parsed.people.length > 0 || picked !== null;
  const names = explicitAssignees ? namesOf(effectiveAssignees, options) : [];

  const token = dismissed ? null : activeToken(text, caret);
  const suggestions = token ? suggest(token, targets) : [];
  const listOpen = suggestions.length > 0;
  const active = listOpen ? Math.min(highlight, suggestions.length - 1) : -1;

  function edit(next: string, nextCaret = next.length) {
    setText(next);
    setCaret(nextCaret);
    setHighlight(0);
    setDismissed(false);
    setError(null);
  }

  /** Removes the tokens of one kind, so a click on a button isn't overruled by what was typed. */
  function dropTokens(kind: QuickAddToken["kind"]) {
    const tokens = parsed.tokens.filter((each) => each.kind === kind);
    if (tokens.length > 0) edit(removeTokens(text, tokens) + " ");
  }

  function pick(index: number) {
    if (token === null) return;
    const choice = suggestions[index];
    if (choice === undefined) return;
    const before = text.slice(0, token.start);
    const after = text.slice(token.end).replace(/^\s*/, "");
    const next = `${before}${choice.insert} ${after}`;
    const at = before.length + choice.insert.length + 1;
    edit(next, at);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(at, at);
    });
  }

  function reset() {
    setText("");
    setCaret(0);
    setPriority("normal");
    setDue("");
    setPicked(null);
    setError(null);
    setGoalId(defaults.goalId ?? "");
  }

  /** The people a task goes to: whoever the title mentions, else whoever was picked, else the creator. */
  function assigneesOf(read: QuickAddParse, ready: TaskFormOptions | null): string[] {
    if (read.people.length > 0) return read.people;
    if (picked !== null) return picked;
    return selfAssignable(ready) ? [ready.viewerId] : [];
  }

  function submit() {
    if (parsed.title === "" || pending) return;
    startTransition(async () => {
      // Mentions can only be read once the people are known: an Enter that beats them waits and reads again.
      const ready = options ?? (await loadTaskFormOptions()).options;
      const read = options ? parsed : parseQuickAdd(text, ready ? mentionTargets(ready.people) : []);
      const result = await createTask({
        title: read.title,
        assigneeIds: assigneesOf(read, ready),
        projectId,
        goalId,
        priority: read.priority ?? priority,
        dueDate: read.due === "today" ? today : read.due === "tomorrow" ? tomorrow : due,
      });
      if (!result.ok) {
        setError(Object.values(result.fieldErrors ?? {})[0]?.[0] ?? result.error);
        return;
      }
      const id = result.data.id;
      toast.success(result.message ?? "Task created.", {
        action: { label: "Open", onClick: () => router.push(`/tasks/${id}`) },
      });
      reset();
      inputRef.current?.focus();
    });
  }

  function moreOptions() {
    openCreate(
      {
        ...defaults,
        projectId,
        goalId,
        title: parsed.title,
        priority: effectivePriority,
        dueDate: effectiveDue,
        ...(explicitAssignees ? { assigneeIds: effectiveAssignees } : {}),
      },
      reset,
    );
  }

  /** What is set while the options row is folded, so nothing is chosen unseen: "High · Tomorrow · Sam Dev". */
  const folded = [
    effectivePriority !== "normal" ? TASK_PRIORITY_LABELS[effectivePriority] : null,
    effectiveDue === today ? "Today" : effectiveDue === tomorrow ? "Tomorrow" : effectiveDue ? `Due ${effectiveDue}` : null,
    projectId ? (options?.projects.find((project) => project.id === projectId)?.name ?? null) : null,
    goalId ? (options?.goals.find((goal) => goal.id === goalId)?.title ?? null) : null,
    names.length > 0 ? names.join(", ") : null,
  ].filter((part): part is string => part !== null);

  const showProject = options === null || options.projects.length > 0 || projectId !== "";
  // The goal picker stays once the workspace has goals: with a project chosen it offers that project's goals (and
  // says when there are none); without one, every goal, and picking a goal puts the task in its project.
  const showGoal = options === null || options.goals.length > 0 || goalId !== "";
  const proposes = options?.proposesOnly === true;
  // Sign-off applies where the task is going (the goal's rule first, else the project's): it will start local.
  const goalChoice = goalId ? options?.goals.find((goal) => goal.id === goalId) : undefined;
  const projectChoice = projectId ? options?.projects.find((project) => project.id === projectId) : undefined;
  const local = !proposes && (goalChoice ? (goalChoice.signOff ?? false) : (projectChoice?.signOff ?? false));

  return (
    <form
      className={cn("mb-6 rounded-xl border bg-card p-3 shadow-xs md:p-4", className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="relative">
        <label htmlFor="quick-add-title" className="sr-only">
          New task
        </label>
        <input
          ref={inputRef}
          id="quick-add-title"
          {...{ [QUICK_ADD_ATTRIBUTE]: "" }}
          value={text}
          maxLength={LIMITS.quickAddTitle}
          autoComplete="off"
          placeholder={proposes ? "Propose a task and press Enter" : "Add a task and press Enter"}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby="quick-add-hint"
          className="h-11 w-full bg-transparent px-1 text-lg outline-none placeholder:text-muted-foreground md:text-xl"
          onChange={(event) => edit(event.target.value, event.target.selectionStart ?? event.target.value.length)}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onBlur={() => setDismissed(true)}
          onFocus={() => setDismissed(false)}
          onKeyDown={(event) => {
            if (listOpen) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setHighlight((active + step + suggestions.length) % suggestions.length);
                return;
              }
              // Tab always completes; Enter completes a half-typed shortcut and submits once it is whole.
              if (event.key === "Tab" || (event.key === "Enter" && token !== null && parsedTokenIncomplete(parsed, token))) {
                event.preventDefault();
                pick(active);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDismissed(true);
                return;
              }
            }
            if (event.key === "Escape" && text !== "") {
              event.preventDefault();
              reset();
            }
          }}
        />
        {listOpen ? (
          <ul id={listId} role="listbox" aria-label="Suggestions" className="absolute top-full left-0 z-40 mt-1 w-full max-w-sm overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.insert + suggestion.label}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(index);
                }}
                onMouseMove={() => setHighlight(index)}
                className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-base", index === active && "bg-accent")}
              >
                {suggestion.kind === "due" ? (
                  <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                ) : suggestion.kind === "priority" ? (
                  <span className={cn("size-2 rounded-full", PRIORITIES.find((each) => `!${each.value}` === suggestion.insert)?.dot)} aria-hidden />
                ) : (
                  <span className="size-4" aria-hidden />
                )}
                <span className="truncate">{suggestion.label}</span>
                <span className="ml-auto shrink-0 text-[13px] text-muted-foreground">{suggestion.hint}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {optionsOpen ? (
        <div id="quick-add-options" className="mt-3 flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Priority" className="inline-flex rounded-md border bg-background p-0.5">
            {PRIORITIES.map((each) => {
              const checked = effectivePriority === each.value;
              return (
                <button
                  key={each.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => {
                    setPriority(each.value);
                    dropTokens("priority");
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-[5px] px-2.5 text-[14px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    checked ? "bg-accent text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <span className={cn("size-2 rounded-full", each.dot)} aria-hidden />
                  {TASK_PRIORITY_LABELS[each.value]}
                </button>
              );
            })}
          </div>

          <div role="group" aria-label="Due" className="inline-flex rounded-md border bg-background p-0.5">
            <Toggle
              active={effectiveDue === today}
              label="Due today"
              onClick={() => {
                setDue(effectiveDue === today ? "" : today);
                dropTokens("due");
              }}
            >
              Today
            </Toggle>
            <Toggle
              active={effectiveDue === tomorrow}
              label="Due tomorrow"
              onClick={() => {
                setDue(effectiveDue === tomorrow ? "" : tomorrow);
                dropTokens("due");
              }}
            >
              Tomorrow
            </Toggle>
          </div>

          <input
            type="date"
            aria-label="Due date"
            id="quick-add-due"
            value={effectiveDue}
            onChange={(event) => {
              setDue(event.target.value);
              dropTokens("due");
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:scheme-dark"
          />

          {showProject ? (
            <ProjectPicker
              id="quick-add-project"
              label="Project"
              className="w-full sm:w-52"
              value={projectId}
              options={options?.projects ?? null}
              pinned={options?.pinnedProjects ?? []}
              noneLabel="No project"
              onChange={(next) => {
                setProjectId(next);
                // A goal from another project can't follow the task.
                if (goalId && !options?.goals.some((goal) => goal.id === goalId && goal.projectId === next)) setGoalId("");
              }}
            />
          ) : null}

          {showGoal ? (
            <GoalPicker
              id="quick-add-goal"
              label="Goal"
              className="w-full sm:w-56"
              value={goalId}
              goals={options?.goals ?? null}
              projects={options?.projects ?? []}
              projectId={projectId}
              onChange={(next) => {
                setGoalId(next);
                const goal = options?.goals.find((each) => each.id === next);
                if (goal && goal.projectId !== projectId) setProjectId(goal.projectId);
              }}
            />
          ) : null}

          {/* Who it goes to, right here: a typed @mention still wins, and picking clears the mention from the title. */}
          <AssigneePicker
            label="Assigned to"
            value={effectiveAssignees}
            onChange={(next) => {
              setPicked(next);
              dropTokens("person");
            }}
            options={options ? { people: options.people, viewerId: options.viewerId } : null}
            assumeMe={!explicitAssignees}
            className="w-full sm:w-auto sm:min-w-44"
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p id="quick-add-hint" className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] text-muted-foreground" aria-live="polite">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : !optionsOpen && folded.length > 0 ? (
            <span>
              Set: <span className="font-medium text-foreground">{folded.join(" · ")}</span>
              {parsed.unmatched.length > 0 ? ` · ${parsed.unmatched.join(", ")} ${parsed.unmatched.length === 1 ? "stays" : "stay"} in the title.` : "."}
            </span>
          ) : names.length > 0 || parsed.unmatched.length > 0 ? (
            <>
              {names.length > 0 ? (
                <span>
                  Assigning to <span className="font-medium text-foreground">{names.join(", ")}</span>.
                </span>
              ) : null}
              {parsed.unmatched.length > 0 ? (
                <span>
                  {parsed.unmatched.join(", ")} {parsed.unmatched.length === 1 ? "doesn't" : "don't"} name one person, so {parsed.unmatched.length === 1 ? "it stays" : "they stay"} in the title.
                </span>
              ) : null}
            </>
          ) : proposes ? (
            <span>A proposal: a leader or admin signs it off before it becomes a live task. Follow it under Proposals.</span>
          ) : local ? (
            <span data-local-hint>Sign-off is on here: the task stays local, seen by you alone, until you send it for sign-off from your Local section.</span>
          ) : (
            <>
              <span>Shortcuts in the title:</span>
              {SHORTCUT_HINTS.map((hint) => (
                <code key={hint} className={chip}>
                  {hint}
                </code>
              ))}
              <span className="hidden sm:inline">
                . Press <kbd className={chip}>N</kbd> anywhere to jump here.
              </span>
            </>
          )}
        </p>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <CharacterCounter value={text} max={LIMITS.quickAddTitle} />
          <Button type="button" variant="ghost" aria-expanded={optionsOpen} aria-controls="quick-add-options" onClick={() => toggleOptions(!optionsOpen)} className="text-muted-foreground">
            {optionsOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            {optionsOpen ? "Hide options" : "Options"}
          </Button>
          {options?.canCapture ? (
            <Button asChild variant="ghost" className="text-muted-foreground">
              <Link href={projectId ? `/capture?project=${projectId}` : "/capture"}>
                <AudioLines aria-hidden />
                From a meeting
              </Link>
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={moreOptions} className="text-muted-foreground">
            <SlidersHorizontal aria-hidden />
            More options
          </Button>
          <Button type="submit" disabled={pending || parsed.title === ""} className="ml-auto sm:ml-0">
            <Plus aria-hidden />
            {pending ? (proposes ? "Proposing…" : "Adding…") : proposes ? "Propose task" : local ? "Add local task" : "Add task"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** True while the word under the caret isn't yet a whole shortcut, so Enter completes it instead of submitting. */
function parsedTokenIncomplete(parsed: QuickAddParse, token: { start: number }): boolean {
  return !parsed.tokens.some((each) => each.start === token.start);
}
