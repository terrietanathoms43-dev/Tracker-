import type { TaskPriority } from "@/lib/constants";
import { nameOf } from "@/lib/tasks/people";
import { addDays } from "@/lib/time";
import type { CaptureContext } from "./draft";
import type { Proposal } from "./prompt";

// The stand-in for the model that test personas get (lib/capture/availability.ts): a plain, deterministic reading
// of the notes, so the review flow can be walked through end to end without a key, a network or a bill. It is
// deliberately literal and only understands a few line starts:
//
//   Meeting: <title>
//   Project: <name>                     an existing project by name, else a new one
//   Goal: <title>                       an existing goal by title, else a new one; tasks below it point at it
//   Action item: <who> will <what> by <when>     (also "Action:", "Todo:", "To do:")
//
// People are matched by first name or full name; "by tomorrow", "by Friday", "by 2026-11-14", "next week" set the
// due date; "urgent" / "asap" and "high priority" set the priority. Anything else is ignored.

const ACTION = /^(?:action item|action|todo|to do)\s*:\s*(.+)$/i;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The next <weekday> after today (a week away when today is that day). */
function nextWeekday(today: string, weekday: number): string {
  const current = new Date(`${today}T00:00:00Z`).getUTCDay();
  const ahead = (weekday - current + 7) % 7 || 7;
  return addDays(today, ahead);
}

function dueFrom(text: string, today: string): string | null {
  const lower = text.toLowerCase();
  const explicit = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicit) return explicit[1];
  if (/\btoday\b/.test(lower)) return today;
  if (/\btomorrow\b/.test(lower)) return addDays(today, 1);
  if (/\bnext week\b/.test(lower)) return addDays(today, 7);
  const weekday = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(lower));
  return weekday >= 0 ? nextWeekday(today, weekday) : null;
}

function priorityFrom(text: string): TaskPriority {
  if (/\b(urgent|asap)\b/i.test(text)) return "urgent";
  if (/\b(high priority|important)\b/i.test(text)) return "high";
  if (/\b(nice to have|low priority)\b/i.test(text)) return "low";
  return "normal";
}

/** The people a line names, by first name or full name, in the order they appear on the roster. */
function peopleIn(text: string, context: CaptureContext): string[] {
  return context.people
    .filter((person) => {
      const full = nameOf(person, "");
      const first = full.split(/\s+/)[0] ?? "";
      return [full, first].filter((name) => name.length > 1).some((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text));
    })
    .map((person) => person.id);
}

/** "Jordan will fix the backup by Friday" → "Fix the backup". */
function titleFrom(text: string, context: CaptureContext): string {
  let title = text.trim();
  for (const person of context.people) {
    const full = nameOf(person, "");
    const first = full.split(/\s+/)[0] ?? "";
    for (const name of [full, first].filter((each) => each.length > 1)) {
      title = title.replace(new RegExp(`^${escapeRegExp(name)}(?:\\s+and\\s+[A-Z][\\w-]*)*\\s+(?:will|to|should|is going to)\\s+`, "i"), "");
    }
  }
  // Trailing priority words ("..., high priority", "... (urgent)") go first, then a trailing due phrase.
  title = title
    .replace(/\s*(?:[,;(—-]\s*)?(?:urgent|asap|high priority|important|nice to have|low priority)\)?\s*\.?$/i, "")
    .replace(/\s*,?\s*(?:by\s+|on\s+)?(?:tomorrow|today|next week|\d{4}-\d{2}-\d{2}|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\s*\.?$/i, "")
    .replace(/[.\s]+$/, "")
    .trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** A literal reading of the notes, in the model's shape, so the rest of the flow is the same either way. */
export function fakeProposal(context: CaptureContext, transcript: string): Proposal {
  const lines = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const proposal: Proposal = {
    meetingTitle: "Meeting notes",
    summary: "",
    project: { existingId: null, newName: null, newDescription: null, newTargetDate: null, goalKey: null },
    goals: [],
    tasks: [],
  };
  let currentGoalKey: string | null = null;

  for (const line of lines) {
    const meeting = line.match(/^meeting\s*:\s*(.+)$/i);
    if (meeting) {
      proposal.meetingTitle = meeting[1].trim();
      continue;
    }
    const project = line.match(/^project\s*:\s*(.+)$/i);
    if (project) {
      const name = project[1].trim();
      const existing = context.projects.find((each) => each.name.toLowerCase() === name.toLowerCase());
      proposal.project = { ...proposal.project, existingId: existing?.id ?? null, newName: existing ? null : name };
      continue;
    }
    const goal = line.match(/^goal\s*:\s*(.+)$/i);
    if (goal) {
      const title = goal[1].trim();
      const existing = context.goals.find((each) => each.title.toLowerCase() === title.toLowerCase());
      const key = `g${proposal.goals.length + 1}`;
      proposal.goals.push({ key, existingId: existing?.id ?? null, title, description: null, targetDate: dueFrom(title, context.today), parentGoalId: null, evidence: line });
      currentGoalKey = key;
      continue;
    }
    const action = line.match(ACTION);
    if (action) {
      const body = action[1].trim();
      proposal.tasks.push({
        key: `t${proposal.tasks.length + 1}`,
        title: titleFrom(body, context),
        description: null,
        nextAction: null,
        assigneeIds: peopleIn(body, context),
        unmatchedNames: [],
        dueDate: dueFrom(body, context.today),
        priority: priorityFrom(body),
        goalKey: currentGoalKey,
        evidence: line,
      });
    }
  }

  if (proposal.project.goalKey === null && proposal.project.newName !== null && proposal.goals.length > 0) proposal.project.goalKey = proposal.goals[0].key;
  proposal.summary = `Read ${proposal.tasks.length} action ${proposal.tasks.length === 1 ? "item" : "items"} and ${proposal.goals.length} ${proposal.goals.length === 1 ? "goal" : "goals"} from the notes. (Test mode: a plain parser stands in for the model and only reads lines starting with "Action item:", "Goal:", "Project:" and "Meeting:".)`;
  return proposal;
}
