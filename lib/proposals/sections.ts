import type { ProposalListItem } from "@/lib/dal/approvals";

// The Proposals page's sections (docs/PLAN.md, 2026-11-03 log), as a pure function over the list the DAL gives:
// what waits for me, what waits for someone else, what I proposed, and what was decided lately.

export type ProposalSections = {
  /** Pending, and the current step is mine to decide: oldest first, they have waited longest. */
  waitingForMe: ProposalListItem[];
  /** Pending, someone else's step: oldest first. */
  waitingOnOthers: ProposalListItem[];
  /** Everything I proposed that is still open or was decided lately, newest first. */
  mine: ProposalListItem[];
  /** Approved or declined lately, not mine: newest first. */
  decided: ProposalListItem[];
};

const byCreated = (a: ProposalListItem, b: ProposalListItem) => a.createdAt.localeCompare(b.createdAt);
const byUpdatedDesc = (a: ProposalListItem, b: ProposalListItem) => b.updatedAt.localeCompare(a.updatedAt);

export function groupProposals(items: ProposalListItem[]): ProposalSections {
  const pending = items.filter((item) => item.status === "pending");
  return {
    waitingForMe: pending.filter((item) => item.canDecide).sort(byCreated),
    waitingOnOthers: pending.filter((item) => !item.canDecide && !item.isMine).sort(byCreated),
    mine: items.filter((item) => item.isMine).sort(byUpdatedDesc),
    decided: items.filter((item) => item.status !== "pending" && !item.isMine).sort(byUpdatedDesc),
  };
}

/** "Terri Tan ✓ · Max Reid (up next) · Avery Admin": the chain in one line. */
export function describeChain(item: Pick<ProposalListItem, "steps" | "current">): string {
  return item.steps
    .map((step) => {
      const name = step.user ? (step.user.name ?? step.user.email ?? "Someone") : "Any leader";
      if (step.decision === "approved") return `${name} ✓`;
      if (step.decision === "declined") return `${name} ✗`;
      return item.current?.id === step.id ? `${name} (up next)` : name;
    })
    .join(" · ");
}
