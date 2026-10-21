"use client";

import { cn } from "cn";
import { CalendarDays, Plus, SlidersHorizontal, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { createTask } from "@/actions/tasks";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import type { AssigneeIds } from "@/lib/tasks/assignees";
import { nameOf } from "@/lib/tasks/people";
import { activeToken, mentionTargets, parseQuickAdd, removeTokens, suggest, type QuickAddParse, type QuickAddToken } from "@/lib/tasks/quick-add";
import type { CreateDefaults, TaskFormOptions } from "@/lib/tasks/types";
import { addDays } from "@/lib/time";
import { QUICK_ADD_ATTRIBUTE, useTaskActions } from "./task-actions";
import { loadTaskFormOptions, useTaskFormOptions } from "./use-task-form-options";

// The always-open add bar at the top of Home, My Work, Tasks and the project and goal pages: type a title, press
// Enter. Priority, due date and assignees can be clicked or typed into the title (lib/tasks/quick-add.ts);
// "More options" carries everything over to the full New task dialog.

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

/** Who the parsed title assigns, by name: "Sam Dev, Frontend". */
function assignedNames(parsed: QuickAddParse, options: TaskFormOptions | null): string[] {
  if (options === null) return [];
  return [
    ...parsed.people.map((id) => (id === options.viewerId ? "You" : nameOf(options.people.find((person) => person.id === id)))),
    ...parsed.teams.map((id) => options.teams.find((team) => team.id === id)?.name ?? "A team"),
  ];
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
  const [highlight, setHighlight] = useState(0);
  /** Escape hides the suggestions until the next keystroke. */
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const targets = useMemo(() => (options ? mentionTargets(options.people, options.teams) : []), [options]);
  const parsed = parseQuickAdd(text, targets);
  const tomorrow = addDays(today, 1);
  const effectivePriority = parsed.priority ?? priority;
  const effectiveDue = parsed.due === "today" ? today : parsed.due === "tomorrow" ? tomorrow : due;
  const names = assignedNames(parsed, options);

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
    setError(null);
  }

  function assignment(read: QuickAddParse, viewerId: string | null): AssigneeIds {
    if (read.people.length + read.teams.length > 0) return { assigneeIds: read.people, teamIds: read.teams };
    return { assigneeIds: viewerId ? [viewerId] : [], teamIds: [] };
  }

  function submit() {
    if (parsed.title === "" || pending) return;
    startTransition(async () => {
      // Mentions can only be read once the people are known: an Enter that beats them waits and reads again.
      const ready = options ?? (await loadTaskFormOptions()).options;
      const read = options ? parsed : parseQuickAdd(text, ready ? mentionTargets(ready.people, ready.teams) : []);
      const result = await createTask({
        title: read.title,
        ...assignment(read, ready?.viewerId ?? null),
        projectId,
        goalId: defaults.goalId ?? "",
        priority: read.priority ?? priority,
        dueDate: read.due === "today" ? today : read.due === "tomorrow" ? tomorrow : due,
      });
      if (!result.ok) {
        setError(Object.values(result.fieldErrors ?? {})[0]?.[0] ?? result.error);
        return;
      }
      const id = result.data.id;
      toast.success(result.message ?? "Task created.", { action: { label: "Open", onClick: () => router.push(`/tasks/${id}`) } });
      reset();
      inputRef.current?.focus();
    });
  }

  function moreOptions() {
    const typed = parsed.people.length + parsed.teams.length > 0;
    openCreate(
      {
        ...defaults,
        projectId,
        title: parsed.title,
        priority: effectivePriority,
        dueDate: effectiveDue,
        ...(typed ? { assignment: { assigneeIds: parsed.people, teamIds: parsed.teams } } : {}),
      },
      reset,
    );
  }

  const showProject = options === null || options.projects.length > 0 || projectId !== "";

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
          maxLength={260}
          autoComplete="off"
          placeholder="Add a task and press Enter"
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
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            className="absolute top-full left-0 z-40 mt-1 w-full max-w-sm overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          >
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
                {suggestion.kind === "team" ? (
                  <UsersRound className="size-4 text-muted-foreground" aria-hidden />
                ) : suggestion.kind === "due" ? (
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
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
          className="h-9 rounded-md border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:[color-scheme:dark]"
        />

        {showProject ? (
          <NativeSelect
            id="quick-add-project"
            aria-label="Project"
            className="w-full min-w-40 sm:w-52"
            value={projectId}
            disabled={options === null}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">{options === null ? "Loading…" : "No project"}</option>
            {(options?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}

        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <Button type="button" variant="ghost" onClick={moreOptions} className="text-muted-foreground">
            <SlidersHorizontal aria-hidden />
            More options
          </Button>
          <Button type="submit" disabled={pending || parsed.title === ""} className="ml-auto sm:ml-0">
            <Plus aria-hidden />
            {pending ? "Adding…" : "Add task"}
          </Button>
        </div>
      </div>

      <p id="quick-add-hint" className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] text-muted-foreground" aria-live="polite">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : names.length > 0 || parsed.unmatched.length > 0 ? (
          <>
            {names.length > 0 ? (
              <span>
                Assigning to <span className="font-medium text-foreground">{names.join(", ")}</span>.
              </span>
            ) : null}
            {parsed.unmatched.length > 0 ? (
              <span>
                {parsed.unmatched.join(", ")} {parsed.unmatched.length === 1 ? "doesn't" : "don't"} name one person or team, so{" "}
                {parsed.unmatched.length === 1 ? "it stays" : "they stay"} in the title.
              </span>
            ) : null}
          </>
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
    </form>
  );
}

/** True while the word under the caret isn't yet a whole shortcut, so Enter completes it instead of submitting. */
function parsedTokenIncomplete(parsed: QuickAddParse, token: { start: number }): boolean {
  return !parsed.tokens.some((each) => each.start === token.start);
}
