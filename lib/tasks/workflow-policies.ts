import type { TaskPolicyItem } from "./policy-checklist";

export type PolicyOwnerKind = "workspace" | "project" | "goal";
export type PolicyScopeKind = PolicyOwnerKind | "task";
export type PolicyTemplate = { id: string; label: string };
export type PolicySource = { kind: PolicyScopeKind; id: string };
export type WorkflowPolicy = {
  id: string;
  orgId: string;
  name: string;
  ownerKind: PolicyOwnerKind;
  ownerId: string;
  templates: PolicyTemplate[];
};
export type PolicyAttachment = {
  orgId: string;
  policyId: string;
  scopeKind: PolicyScopeKind;
  scopeId: string;
};
export type PolicyPlacement = {
  orgId: string;
  projectId: string | null;
  /** The selected goal and, when applicable, its ancestor goals. */
  goalIds: readonly string[];
  taskId?: string;
};
export type PolicyApplication = { policy: WorkflowPolicy; sources: PolicySource[] };

function scopeMatches(kind: PolicyScopeKind, id: string, placement: PolicyPlacement): boolean {
  if (kind === "workspace") return id === placement.orgId;
  if (kind === "project") return id === placement.projectId;
  if (kind === "goal") return placement.goalIds.includes(id);
  return id === placement.taskId;
}

/** Collect automatic and manual attachments, once per policy, within the same workspace. */
export function resolvePolicyApplications(
  policies: readonly WorkflowPolicy[],
  attachments: readonly PolicyAttachment[],
  placement: PolicyPlacement,
): PolicyApplication[] {
  const available = new Map(policies.filter((policy) => policy.orgId === placement.orgId).map((policy) => [policy.id, policy]));
  const applied = new Map<string, PolicyApplication>();
  for (const attachment of attachments) {
    if (attachment.orgId !== placement.orgId || !scopeMatches(attachment.scopeKind, attachment.scopeId, placement)) continue;
    const policy = available.get(attachment.policyId);
    if (!policy) continue;
    const source: PolicySource = { kind: attachment.scopeKind, id: attachment.scopeId };
    const application = applied.get(policy.id);
    if (!application) applied.set(policy.id, { policy, sources: [source] });
    else if (!application.sources.some((entry) => entry.kind === source.kind && entry.id === source.id)) application.sources.push(source);
  }
  return [...applied.values()];
}

/**
 * Materializes one checklist snapshot per applied policy. Existing snapshots are preserved, including their
 * signatures, until policy edit/removal behavior is agreed. The caller must lock the parent task while writing
 * this snapshot and creating actual child tasks. Policy-generated children must not recursively inherit policies.
 */
export function addPolicySnapshots(
  existing: readonly TaskPolicyItem[],
  applications: readonly PolicyApplication[],
  makeId: () => string = () => crypto.randomUUID(),
): TaskPolicyItem[] {
  const applied = new Set(existing.flatMap((item) => item.policyId ? [item.policyId] : []));
  const result = [...existing];
  for (const { policy, sources } of applications) {
    if (applied.has(policy.id)) continue;
    applied.add(policy.id);
    const templateIds = new Set<string>();
    for (const template of policy.templates) {
      if (templateIds.has(template.id)) continue;
      templateIds.add(template.id);
      result.push({
        id: makeId(),
        label: template.label,
        policyId: policy.id,
        policyName: policy.name,
        policyTemplateId: template.id,
        policySources: [...sources],
        checkedAt: null,
        checkedBy: null,
        signedAt: null,
        signedBy: null,
      });
    }
  }
  return result;
}
