import { z } from "zod";
import { TASK_PRIORITIES } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { sanitizeText } from "@/lib/sanitize";
import { nameOf } from "@/lib/tasks/people";
import { blankGoal, type CaptureContext, type CaptureDraft, type DraftGoal, type DraftTask } from "./draft";

// What the helper is asked, and how its answer becomes a draft (docs/PLAN.md, 2026-11-01 log). Pure, so the
// normalising is unit-tested: whatever comes back, only ids this workspace has survive, every date is a real day,
// every key is unique, and nothing is longer than the server will accept.

/** The shape the model fills in. Every field is present (null when it has nothing to say) so the output is strict. */
export const proposalSchema = z.object({
  meetingTitle: z.string(),
  summary: z.string(),
  project: z.object({
    existingId: z.string().nullable(),
    newName: z.string().nullable(),
    newDescription: z.string().nullable(),
    newTargetDate: z.string().nullable(),
    goalKey: z.string().nullable(),
  }),
  goals: z.array(
    z.object({
      key: z.string(),
      existingId: z.string().nullable(),
      title: z.string(),
      description: z.string().nullable(),
      targetDate: z.string().nullable(),
      parentGoalId: z.string().nullable(),
      evidence: z.string(),
    }),
  ),
  tasks: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      nextAction: z.string().nullable(),
      assigneeIds: z.array(z.string()),
      unmatchedNames: z.array(z.string()),
      dueDate: z.string().nullable(),
      priority: z.enum(TASK_PRIORITIES),
      goalKey: z.string().nullable(),
      evidence: z.string(),
    }),
  ),
});

export type Proposal = z.infer<typeof proposalSchema>;

/** The standing instructions: stable text first, so repeated drafts share a cached prefix. */
export const SYSTEM_PROMPT = `You turn the transcript or notes of a team meeting into a plan for a small team's work tracker.

The tracker has people, projects, goals and tasks. A task is one piece of work with a title, optionally some people assigned, a due date, a priority, a first next action and a project or goal it belongs to. A goal is an outcome the team wants; a goal may have sub-goals one level deep. A project groups tasks and may roll up into a goal.

Rules:
- Propose only work the meeting actually committed to: someone agreed to do it, or the group clearly decided it will be done. Discussion, options and opinions are not tasks.
- Prefer the existing projects and goals you are given. Propose a new project only when the meeting is plainly about work no existing project covers. Propose a new goal only when an outcome is named that no existing goal states. Reuse an existing one by its id.
- Assign a task only to the people the meeting named for it, by their ids from the roster. Put any name you cannot match to the roster into unmatchedNames instead of guessing.
- Resolve relative dates ("Friday", "next week", "end of the month") against the meeting date, which is today unless the transcript says otherwise, in the workspace's timezone. Write dates as YYYY-MM-DD. Leave a date null when none was said.
- Priority is "urgent" or "high" only when the meeting said so; otherwise "normal" (or "low" when it was called nice-to-have).
- For every goal and task give evidence: a short verbatim quote (under 300 characters) from the transcript it rests on.
- Titles are imperative and under 100 characters. nextAction is the first concrete step, when one was said.
- Keys are short unique slugs (like "t1", "g1"); a task's goalKey names one of your goals' keys or an existing goal's id.
- Merge duplicates. At most 60 tasks and 12 goals.
- meetingTitle is a short name for the meeting; summary is one or two sentences on what was decided.`;

/** The per-draft message: the workspace's facts, then the transcript, kept apart from the instructions. */
export function buildUserMessage(context: CaptureContext, transcript: string): string {
  const people = context.people.map((person) => `- ${person.id} — ${nameOf(person)}`).join("\n") || "- (nobody)";
  const projects = context.projects.map((project) => `- ${project.id} — ${project.name}${project.goal ? ` (rolls up into goal: ${project.goal.title})` : ""}`).join("\n") || "- (none yet)";
  const goals =
    context.goals
      .map((goal) => {
        const parent = goal.parentGoalId ? context.goals.find((each) => each.id === goal.parentGoalId) : null;
        return `- ${goal.id} — ${goal.title}${parent ? ` (sub-goal of: ${parent.title})` : ""}${goal.targetDate ? ` (target ${goal.targetDate})` : ""}`;
      })
      .join("\n") || "- (none yet)";
  const starting = context.projects.find((project) => project.id === context.defaultProjectId);
  return [
    `Today is ${context.today} (${context.timezone}).`,
    "",
    "People (id — name):",
    people,
    "",
    "Projects (id — name):",
    projects,
    "",
    "Goals (id — title):",
    goals,
    "",
    starting ? `The person started from the project "${starting.name}" (${starting.id}); put the work there unless the meeting was clearly about something else.` : "No project was chosen in advance.",
    "",
    "Transcript:",
    "<transcript>",
    transcript,
    "</transcript>",
    "",
    "Propose the plan.",
  ].join("\n");
}

// --- from the model's answer to a draft ---------------------------------------------------------------------------

/** A real calendar day: the format, and the date round-trips (JavaScript would quietly turn Feb 30 into March 2). */
const isDay = (value: string | null | undefined): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const text = (value: string | null | undefined, max: number): string => sanitizeText(value ?? "").trim().slice(0, max);

/** Keys unique and non-empty: a repeated or missing key becomes "<prefix>-<n>". */
function uniqueKeys(keys: (string | null | undefined)[], prefix: string): string[] {
  const seen = new Set<string>();
  return keys.map((key, index) => {
    const clean = (key ?? "").trim().slice(0, 64);
    const candidate = clean !== "" && !seen.has(clean) ? clean : `${prefix}-${index + 1}`;
    seen.add(candidate);
    return candidate;
  });
}

/**
 * The model's proposal as a draft the review screen can hold: ids it invented are dropped, people it could not
 * place stay as names, dates that aren't days are cleared, and the person's starting project wins when the model
 * named none.
 */
export function proposalToDraft(proposal: Proposal, context: CaptureContext): CaptureDraft {
  const peopleIds = new Set(context.people.map((person) => person.id));
  const projectIds = new Set(context.projects.map((project) => project.id));
  const goalIds = new Set(context.goals.map((goal) => goal.id));
  const topLevelGoalIds = new Set(context.goals.filter((goal) => goal.parentGoalId === null).map((goal) => goal.id));

  const goalKeys = uniqueKeys(
    proposal.goals.map((goal) => goal.key),
    "goal",
  );
  const goals: DraftGoal[] = proposal.goals
    .map((goal, index): DraftGoal => {
      const existing = goal.existingId && goalIds.has(goal.existingId) ? context.goals.find((each) => each.id === goal.existingId) : undefined;
      return {
        ...blankGoal(index + 1),
        key: goalKeys[index],
        mode: existing ? "existing" : "new",
        existingId: existing?.id ?? "",
        title: text(existing?.title ?? goal.title, LIMITS.goalTitle),
        description: text(goal.description, LIMITS.goalDescription),
        targetDate: isDay(goal.targetDate) ? goal.targetDate : "",
        parentGoalId: goal.parentGoalId && topLevelGoalIds.has(goal.parentGoalId) ? goal.parentGoalId : "",
        evidence: text(goal.evidence, LIMITS.captureEvidence),
      };
    })
    .filter((goal) => goal.title !== "")
    .slice(0, LIMITS.captureGoals);
  const draftGoalKeys = new Set(goals.map((goal) => goal.key));
  const goalRef = (key: string | null | undefined): string => (key && (draftGoalKeys.has(key) || goalIds.has(key)) ? key : "");

  const taskKeys = uniqueKeys(
    proposal.tasks.map((task) => task.key),
    "task",
  );
  const tasks: DraftTask[] = proposal.tasks
    .map(
      (task, index): DraftTask => ({
        key: taskKeys[index],
        include: true,
        title: text(task.title, LIMITS.taskTitle),
        description: text(task.description, LIMITS.taskDescription),
        nextAction: text(task.nextAction, LIMITS.nextAction),
        assigneeIds: [...new Set(task.assigneeIds.filter((id) => peopleIds.has(id)))].slice(0, 20),
        unmatchedNames: [...new Set(task.unmatchedNames.map((name) => text(name, 80)).filter((name) => name !== ""))].slice(0, 20),
        dueDate: isDay(task.dueDate) ? task.dueDate : "",
        priority: TASK_PRIORITIES.includes(task.priority) ? task.priority : "normal",
        goalKey: goalRef(task.goalKey),
        evidence: text(task.evidence, LIMITS.captureEvidence),
      }),
    )
    .filter((task) => task.title !== "")
    .slice(0, LIMITS.captureTasks);

  const proposedProject = proposal.project;
  const existingProject = proposedProject.existingId && projectIds.has(proposedProject.existingId) ? proposedProject.existingId : "";
  const newName = text(proposedProject.newName, LIMITS.projectName);
  const project: CaptureDraft["project"] = {
    mode: existingProject ? "existing" : newName ? "new" : context.defaultProjectId ? "existing" : "none",
    existingId: existingProject || (newName ? "" : context.defaultProjectId),
    name: newName,
    description: text(proposedProject.newDescription, LIMITS.projectDescription),
    targetDate: isDay(proposedProject.newTargetDate) ? proposedProject.newTargetDate : "",
    goalKey: goalRef(proposedProject.goalKey),
  };

  return {
    meetingTitle: text(proposal.meetingTitle, LIMITS.captureMeetingTitle) || "Meeting notes",
    summary: text(proposal.summary, LIMITS.captureSummary),
    project,
    goals,
    tasks,
  };
}
