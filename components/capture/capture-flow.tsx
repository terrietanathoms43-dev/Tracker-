"use client";

import { cn } from "cn";
import { AudioLines, Check, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { applyCapture, draftFromTranscript } from "@/actions/capture";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { Segmented } from "@/components/segmented";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { blankGoal, blankTask, describeCounts, draftCounts, type CaptureContext, type CaptureDraft, type CaptureProvider, type DraftGoal, type DraftTask } from "@/lib/capture/draft";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { nameOf } from "@/lib/tasks/people";
import { toastResult } from "@/lib/toast-result";

// Capture from a meeting, in two screens (docs/PLAN.md, 2026-11-01 log). First the transcript (pasted, or a .vtt /
// .txt file read in the browser) and the project to start from; then the draft, every line of it editable and
// tickable, with the words it rests on under each proposal, and one button that creates what is ticked. The
// helper never writes anything on its own.

/** The smallest transcript worth sending: the same floor the action enforces. */
const MIN_TRANSCRIPT = 20;

type Stage = { kind: "input" } | { kind: "review"; draft: CaptureDraft };

const Quote = ({ text }: { text: string }) =>
  text ? <blockquote className="border-l-2 border-border pl-2.5 text-[13px] text-muted-foreground italic">“{text}”</blockquote> : null;

export function CaptureFlow({ context, provider }: { context: CaptureContext; provider: CaptureProvider }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [transcript, setTranscript] = useState("");
  const [projectId, setProjectId] = useState(context.defaultProjectId);
  const [stage, setStage] = useState<Stage>({ kind: "input" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const people = { people: context.people, viewerId: null };
  const topLevelGoals = context.goals.filter((goal) => goal.parentGoalId === null);
  const goalLabel = (goal: CaptureContext["goals"][number]) => {
    const parent = goal.parentGoalId ? context.goals.find((each) => each.id === goal.parentGoalId) : null;
    return parent ? `${parent.title} › ${goal.title}` : goal.title;
  };

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > LIMITS.transcript * 4) {
      setError("That file is too large to be one meeting. Paste the part you want instead.");
      return;
    }
    const text = await file.text();
    setTranscript(text.slice(0, LIMITS.transcript));
    setError(null);
  }

  function draft() {
    setError(null);
    startTransition(async () => {
      const result = await draftFromTranscript({ transcript, projectId });
      if (!result.ok) {
        setError(result.fieldErrors?.transcript?.[0] ?? result.error);
        return;
      }
      if (result.data.tasks.length === 0 && result.data.goals.length === 0) {
        setError(
          provider === "fake"
            ? 'Nothing was found. In test mode, lines must start with "Action item:", "Goal:" or "Project:".'
            : "No commitments were found in that transcript. If the meeting did decide things, paste the part where it did.",
        );
        return;
      }
      setStage({ kind: "review", draft: result.data });
    });
  }

  if (stage.kind === "input") {
    const tooShort = transcript.trim().length < MIN_TRANSCRIPT;
    return (
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!tooShort && !pending) draft();
        }}
      >
        <Field
          id="capture-transcript"
          label="Transcript or notes"
          hint={
            <>
              Zoom, Teams and Meet transcripts paste in as they are (timestamps included). Or{" "}
              <button type="button" className="text-foreground underline underline-offset-4" onClick={() => fileInput.current?.click()}>
                upload a .vtt or .txt file
              </button>
              .
            </>
          }
          error={error ?? undefined}
          count={{ value: transcript, max: LIMITS.transcript }}
        >
          <Textarea
            id="capture-transcript"
            value={transcript}
            onChange={(event) => {
              setTranscript(event.target.value);
              setError(null);
            }}
            rows={14}
            maxLength={LIMITS.transcript}
            placeholder={"Morgan: Jordan, can you take the runbook links?\nJordan: Yes, by Friday.\n…"}
            aria-invalid={error ? true : undefined}
            className="font-mono text-[13px]"
          />
        </Field>
        <input ref={fileInput} type="file" accept=".vtt,.srt,.txt,.md,text/plain,text/vtt" className="sr-only" aria-label="Upload a transcript file" onChange={(event) => void readFile(event.target.files?.[0])} />

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field id="capture-project" label="Start from" hint="The helper puts the work here unless the meeting was clearly about something else.">
            <NativeSelect id="capture-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Let the helper decide</option>
              {context.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-[13px] text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="size-3.5" aria-hidden />
              What happens next
            </p>
            <p className="mt-1">You get a draft: a project, the goals inside it and the tasks under them, with people and dates, each with the words it came from. You edit it, untick what you don&apos;t want, then create the rest in one go.</p>
            {provider === "fake" ? <p className="mt-1">Test mode: a plain parser stands in for the model and reads lines starting with “Action item:”, “Goal:”, “Project:” and “Meeting:”.</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground" aria-live="polite">
            {pending ? "Reading the meeting… a long one can take a minute." : "Nothing is created at this step."}
          </p>
          <Button type="submit" disabled={tooShort || pending}>
            <AudioLines aria-hidden />
            {pending ? "Drafting…" : "Draft the plan"}
          </Button>
        </div>
      </form>
    );
  }

  return <Review draft={stage.draft} context={context} people={people} topLevelGoals={topLevelGoals} goalLabel={goalLabel} onRestart={() => setStage({ kind: "input" })} router={router} />;
}

// --- the review screen ------------------------------------------------------------------------------------------------

function Review({
  draft: initial,
  context,
  people,
  topLevelGoals,
  goalLabel,
  onRestart,
  router,
}: {
  draft: CaptureDraft;
  context: CaptureContext;
  people: { people: CaptureContext["people"]; viewerId: null };
  topLevelGoals: CaptureContext["goals"];
  goalLabel: (goal: CaptureContext["goals"][number]) => string;
  onRestart: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const counts = draftCounts(draft);
  const nothing = counts.project + counts.goals + counts.tasks === 0;

  const patchProject = (patch: Partial<CaptureDraft["project"]>) => setDraft((d) => ({ ...d, project: { ...d.project, ...patch } }));
  const patchGoal = (key: string, patch: Partial<DraftGoal>) => setDraft((d) => ({ ...d, goals: d.goals.map((goal) => (goal.key === key ? { ...goal, ...patch } : goal)) }));
  const patchTask = (key: string, patch: Partial<DraftTask>) => setDraft((d) => ({ ...d, tasks: d.tasks.map((task) => (task.key === key ? { ...task, ...patch } : task)) }));

  /** The goals a task or the project can point at: the draft's (by key), then the workspace's (by id). */
  const goalChoices = [
    ...draft.goals.filter((goal) => goal.include && goal.title.trim() !== "").map((goal) => ({ value: goal.key, label: `${goal.title}${goal.mode === "new" ? " (new)" : ""}` })),
    ...context.goals.filter((goal) => !draft.goals.some((each) => each.include && each.mode === "existing" && each.existingId === goal.id)).map((goal) => ({ value: goal.id, label: goalLabel(goal) })),
  ];

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await applyCapture(draft);
      if (!result.ok) {
        setError(result.error);
        toastResult(result);
        return;
      }
      toast.success(result.message ?? "Created.");
      router.push(result.data.projectId ? `/projects/${result.data.projectId}` : "/home?view=list");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border bg-card p-4">
        <Field id="capture-title" label="Meeting" count={{ value: draft.meetingTitle, max: LIMITS.captureMeetingTitle }}>
          <Input id="capture-title" value={draft.meetingTitle} maxLength={LIMITS.captureMeetingTitle} onChange={(event) => setDraft((d) => ({ ...d, meetingTitle: event.target.value }))} />
        </Field>
        {draft.summary ? <p className="mt-3 text-[13px] text-muted-foreground">{draft.summary}</p> : null}
      </section>

      {/* The project */}
      <section className="grid gap-3 rounded-lg border bg-card p-4" aria-labelledby="capture-project-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="capture-project-title" className="text-base font-semibold">
            Project
          </h2>
          <Segmented
            label="Project"
            value={draft.project.mode}
            onChange={(mode) => patchProject({ mode })}
            options={[
              { value: "existing", label: "Existing" },
              { value: "new", label: "New" },
              { value: "none", label: "None" },
            ]}
          />
        </div>
        {draft.project.mode === "existing" ? (
          <Field id="capture-project-existing" label="Which project">
            <NativeSelect id="capture-project-existing" value={draft.project.existingId} onChange={(event) => patchProject({ existingId: event.target.value })}>
              <option value="">Pick a project…</option>
              {context.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        {draft.project.mode === "new" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="capture-project-name" label="Name" count={{ value: draft.project.name, max: LIMITS.projectName }}>
              <Input id="capture-project-name" value={draft.project.name} maxLength={LIMITS.projectName} onChange={(event) => patchProject({ name: event.target.value })} />
            </Field>
            <Field id="capture-project-target" label="Target date">
              <Input id="capture-project-target" type="date" value={draft.project.targetDate} onChange={(event) => patchProject({ targetDate: event.target.value })} />
            </Field>
            <Field id="capture-project-description" label="Description" count={{ value: draft.project.description, max: LIMITS.projectDescription }}>
              <Textarea id="capture-project-description" rows={2} value={draft.project.description} maxLength={LIMITS.projectDescription} onChange={(event) => patchProject({ description: event.target.value })} />
            </Field>
          </div>
        ) : null}
        {draft.project.mode === "none" ? (
          <p className="text-[13px] text-muted-foreground">
            The tasks will stand on their own, outside any project.{draft.goals.some((goal) => goal.include && goal.mode === "new") ? " New goals need a project: pick or name one above, or untick them." : ""}
          </p>
        ) : null}
      </section>

      {/* Goals */}
      <section className="rounded-lg border bg-card" aria-labelledby="capture-goals-title">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 id="capture-goals-title" className="text-base font-semibold">
            Goals <span className="ml-1 rounded-md bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{draft.goals.length}</span>
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...d, goals: [...d.goals, blankGoal(d.goals.length + 1)] }))}>
            <Plus aria-hidden />
            Add a goal
          </Button>
        </div>
        {draft.goals.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-muted-foreground">No goal was proposed. The tasks can point at an existing goal below.</p>
        ) : (
          <ul className="divide-y">
            {draft.goals.map((goal) => (
              <li key={goal.key} className={cn("grid gap-3 px-4 py-3", !goal.include && "opacity-60")} data-draft-goal={goal.key}>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-[13px]">
                    <Checkbox checked={goal.include} onCheckedChange={(checked) => patchGoal(goal.key, { include: checked === true })} aria-label={`Include goal ${goal.title || goal.key}`} />
                    Include
                  </label>
                  <Segmented
                    label="Goal kind"
                    value={goal.mode}
                    onChange={(mode) => patchGoal(goal.key, { mode })}
                    options={[
                      { value: "new", label: "New goal" },
                      { value: "existing", label: "Existing goal" },
                    ]}
                  />
                </div>
                {goal.mode === "existing" ? (
                  <NativeSelect aria-label="Which goal" value={goal.existingId} onChange={(event) => patchGoal(goal.key, { existingId: event.target.value, title: context.goals.find((each) => each.id === event.target.value)?.title ?? goal.title })}>
                    <option value="">Pick a goal…</option>
                    {context.goals.map((each) => (
                      <option key={each.id} value={each.id}>
                        {goalLabel(each)}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                    <Input aria-label="Goal title" value={goal.title} maxLength={LIMITS.goalTitle} placeholder="The outcome" onChange={(event) => patchGoal(goal.key, { title: event.target.value })} />
                    <Input aria-label="Target date" type="date" value={goal.targetDate} className="sm:w-40" onChange={(event) => patchGoal(goal.key, { targetDate: event.target.value })} />
                    <NativeSelect aria-label="Parent goal" value={goal.parentGoalId} className="sm:w-56" onChange={(event) => patchGoal(goal.key, { parentGoalId: event.target.value })}>
                      <option value="">Top-level goal</option>
                      {topLevelGoals.map((parent) => (
                        <option key={parent.id} value={parent.id}>
                          Sub-goal of {parent.title}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                )}
                <Quote text={goal.evidence} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tasks */}
      <section className="rounded-lg border bg-card" aria-labelledby="capture-tasks-title">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 id="capture-tasks-title" className="text-base font-semibold">
            Tasks <span className="ml-1 rounded-md bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{draft.tasks.length}</span>
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...d, tasks: [...d.tasks, blankTask(d.tasks.length + 1)] }))}>
            <Plus aria-hidden />
            Add a task
          </Button>
        </div>
        {draft.tasks.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-muted-foreground">No task was proposed.</p>
        ) : (
          <ul className="divide-y">
            {draft.tasks.map((task) => (
              <li key={task.key} className={cn("grid gap-3 px-4 py-3", !task.include && "opacity-60")} data-draft-task={task.key}>
                <div className="flex items-start gap-3">
                  <Checkbox className="mt-2.5" checked={task.include} onCheckedChange={(checked) => patchTask(task.key, { include: checked === true })} aria-label={`Include task ${task.title || task.key}`} />
                  <div className="grid min-w-0 flex-1 gap-3">
                    <Input aria-label="Task title" value={task.title} maxLength={LIMITS.taskTitle} placeholder="What needs doing?" className="text-base font-medium" onChange={(event) => patchTask(task.key, { title: event.target.value })} />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <AssigneePicker label="Assigned to" value={task.assigneeIds} onChange={(assigneeIds) => patchTask(task.key, { assigneeIds })} options={people} />
                      <Input aria-label="Due date" type="date" value={task.dueDate} onChange={(event) => patchTask(task.key, { dueDate: event.target.value })} />
                      <NativeSelect aria-label="Priority" value={task.priority} onChange={(event) => patchTask(task.key, { priority: event.target.value as TaskPriority })}>
                        {TASK_PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>
                            {TASK_PRIORITY_LABELS[priority]}
                          </option>
                        ))}
                      </NativeSelect>
                      <NativeSelect aria-label="Goal" value={task.goalKey} onChange={(event) => patchTask(task.key, { goalKey: event.target.value })}>
                        <option value="">No goal</option>
                        {goalChoices.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <Input aria-label="First next action" value={task.nextAction} maxLength={LIMITS.nextAction} placeholder="First next action (optional)" onChange={(event) => patchTask(task.key, { nextAction: event.target.value })} />
                    {task.unmatchedNames.length > 0 ? (
                      <p className="text-[13px] text-status-awaiting-fg">
                        Also named: {task.unmatchedNames.join(", ")} — not in this workspace, so not assigned.
                      </p>
                    ) : null}
                    {task.assigneeIds.length > 0 ? (
                      <p className="text-[12px] text-muted-foreground">
                        {task.assigneeIds.map((id) => nameOf(context.people.find((person) => person.id === id))).join(", ")} will be told.
                      </p>
                    ) : null}
                    <Quote text={task.evidence} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur md:bottom-4">
        <div className="min-w-0 text-[13px]">
          <p className="font-medium">{nothing ? "Nothing is ticked." : `Will create ${describeCounts(counts)}.`}</p>
          {error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">People assigned are told, as with any new task.</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onRestart} disabled={pending}>
            <RotateCcw aria-hidden />
            Start over
          </Button>
          <Button type="button" onClick={create} disabled={pending || nothing}>
            <Check aria-hidden />
            {pending ? "Creating…" : nothing ? "Create" : `Create ${describeCounts(counts)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
