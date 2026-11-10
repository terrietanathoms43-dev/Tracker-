import { z } from "zod";
import { TASK_PRIORITIES } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";
import { cappedText } from "@/lib/sanitize";
import type { Person } from "@/lib/tasks/types";

// Capture from a meeting (docs/PLAN.md, 2026-11-01 log): a transcript goes in, a draft of a project with its goals
// and tasks comes out, a person edits and approves it, and only then is anything created. The draft is defined once,
// as the zod schema the apply action parses, and every other shape is read off it, so what the review screen holds
// and what the server accepts can never drift apart.

const id = z.string().max(64).default("");
const day = z.union([z.literal(""), z.iso.date({ error: "Pick a date." })]).default("");
/** A short handle the review screen uses to tie tasks to goals within one draft. */
const key = z.string().min(1).max(64);

export const draftProjectSchema = z.object({
  /** "existing" uses `existingId`; "new" creates one from `name`; "none" leaves the tasks outside any project. */
  mode: z.enum(["existing", "new", "none"]).default("none"),
  existingId: id,
  name: cappedText(LIMITS.projectName),
  description: cappedText(LIMITS.projectDescription),
  targetDate: day,
});

export const draftGoalSchema = z.object({
  key,
  include: z.boolean().default(true),
  mode: z.enum(["existing", "new"]).default("new"),
  existingId: id,
  title: cappedText(LIMITS.goalTitle),
  description: cappedText(LIMITS.goalDescription),
  targetDate: day,
  /** For a new sub-goal: the existing top-level goal it belongs under, or "". */
  parentGoalId: id,
  /** The words in the transcript the proposal rests on. */
  evidence: cappedText(LIMITS.captureEvidence),
});

export const draftTaskSchema = z.object({
  key,
  include: z.boolean().default(true),
  title: cappedText(LIMITS.taskTitle),
  description: cappedText(LIMITS.taskDescription),
  nextAction: cappedText(LIMITS.nextAction),
  assigneeIds: z.array(z.string().max(64)).max(20).default([]),
  /** Names the transcript mentioned that match nobody in the workspace: the reviewer decides. */
  unmatchedNames: z.array(z.string().max(80)).max(20).default([]),
  dueDate: day,
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  /** A draft goal's key, an existing goal's id, or "". */
  goalKey: z.string().max(64).default(""),
  evidence: cappedText(LIMITS.captureEvidence),
});

export const captureDraftSchema = z.object({
  meetingTitle: cappedText(LIMITS.captureMeetingTitle),
  summary: cappedText(LIMITS.captureSummary),
  project: draftProjectSchema,
  goals: z.array(draftGoalSchema).max(LIMITS.captureGoals),
  tasks: z.array(draftTaskSchema).max(LIMITS.captureTasks),
});

export type DraftProject = z.infer<typeof draftProjectSchema>;
export type DraftGoal = z.infer<typeof draftGoalSchema>;
export type DraftTask = z.infer<typeof draftTaskSchema>;
export type CaptureDraft = z.infer<typeof captureDraftSchema>;

/** What the helper may point at: who works here, which projects and goals exist, and what day it is. */
export type CaptureContext = {
  today: string;
  timezone: string;
  people: Person[];
  projects: { id: string; name: string }[];
  /** Active goals, each in its project; a sub-goal names its parent. */
  goals: { id: string; title: string; parentGoalId: string | null; targetDate: string | null; projectId: string }[];
  /** The project the person started from (a project page's "From a meeting"), or "". */
  defaultProjectId: string;
};

/** What applying a draft created, so the review screen can say so and go there. */
export type CaptureOutcome = { projectId: string | null; goalIds: string[]; taskIds: string[] };

/** Which engine read the transcript: the model, or the plain parser test personas get (lib/capture/fake.ts). */
export type CaptureProvider = "anthropic" | "openai" | "fake";

/** A fresh task row for the review screen's "Add a task". */
export function blankTask(index: number): DraftTask {
  return { key: `task-${index}`, include: true, title: "", description: "", nextAction: "", assigneeIds: [], unmatchedNames: [], dueDate: "", priority: "normal", goalKey: "", evidence: "" };
}

/** A fresh goal row for "Add a goal". */
export function blankGoal(index: number): DraftGoal {
  return { key: `goal-${index}`, include: true, mode: "new", existingId: "", title: "", description: "", targetDate: "", parentGoalId: "", evidence: "" };
}

/** How many of each thing an approved draft will create, for the button and the toast. */
export function draftCounts(draft: CaptureDraft): { project: 0 | 1; goals: number; tasks: number } {
  return {
    project: draft.project.mode === "new" && draft.project.name.trim() !== "" ? 1 : 0,
    goals: draft.goals.filter((goal) => goal.include && goal.mode === "new" && goal.title.trim() !== "").length,
    tasks: draft.tasks.filter((task) => task.include && task.title.trim() !== "").length,
  };
}

/** "1 project, 2 goals and 5 tasks", or "nothing" when the draft is all unticked. */
export function describeCounts(counts: ReturnType<typeof draftCounts>): string {
  const parts: string[] = [];
  if (counts.project) parts.push("1 project");
  if (counts.goals > 0) parts.push(`${counts.goals} ${counts.goals === 1 ? "goal" : "goals"}`);
  if (counts.tasks > 0) parts.push(`${counts.tasks} ${counts.tasks === 1 ? "task" : "tasks"}`);
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
