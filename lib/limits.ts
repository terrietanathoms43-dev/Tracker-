// The one place every character cap is defined. The zod schemas in actions/ read from here, and so do the
// client's maxLength attributes and character counters — the two sides cannot drift apart. The server is the
// enforcement point (a client cap is only UX); every value here must match the column sizes the schema can hold.

export const LIMITS = {
  // Tasks
  taskTitle: 200,
  /** The quick-add bar takes typed shortcuts ("!high", "@tomorrow") that expand before the title is read. */
  quickAddTitle: 260,
  taskDescription: 10_000,
  nextAction: 1_000,
  progressNote: 4_000,
  comment: 4_000,
  blockedReason: 500,
  blockedBy: 200,
  completionSummary: 2_000,
  /** The note an approver sends a task back with. */
  sendBackNote: 1_000,
  evidenceLabel: 120,
  /** Anything longer is not a link a person would click; http(s) is checked on top of this. */
  url: 2_048,

  // Goals, projects and teams
  goalTitle: 200,
  goalDescription: 4_000,
  successCriteria: 2_000,
  projectName: 200,
  projectDescription: 4_000,
  teamName: 60,
  teamDescription: 500,

  // Workspace and people
  workspaceName: 80,
  memberName: 80,
  email: 254,
  /** 20 addresses of at most 254 characters, plus their separators. */
  inviteEmails: 5_300,

  // Requests
  requestTitle: 200,
  requestDescription: 10_000,
  desiredOutcome: 2_000,
  decisionReason: 1_000,

  // Transient text (filters and the command palette) — never stored, capped to keep URLs and queries sane.
  search: 100,
} as const;
