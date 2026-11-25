export type TaskPolicyItem = {
  id: string;
  label: string;
  checkedAt: string | null;
  checkedBy: string | null;
};

export const MAX_POLICY_ITEMS = 20;
export const MAX_POLICY_LABEL = 200;

export const DEPLOYMENT_POLICY_PRESET = [
  "Repository protection is enabled",
  "The required ShadCN component is used",
  "The deployment was verified on staging",
] as const;

export function createPolicyChecklist(labels: string[]): TaskPolicyItem[] {
  return labels.map((label) => ({ id: crypto.randomUUID(), label, checkedAt: null, checkedBy: null }));
}

export function incompletePolicyCount(items: readonly TaskPolicyItem[] = []): number {
  return items.filter((item) => item.checkedAt === null || item.checkedBy === null).length;
}

export function policiesAreComplete(items: readonly TaskPolicyItem[] = []): boolean {
  return incompletePolicyCount(items) === 0;
}

export function incompletePoliciesMessage(count: number): string {
  return `Complete the ${count} remaining policy ${count === 1 ? "check" : "checks"} before sending this task for approval.`;
}

export function resetPolicyChecklist(items: readonly TaskPolicyItem[] = []): TaskPolicyItem[] {
  return items.map((item) => ({ ...item, checkedAt: null, checkedBy: null }));
}
