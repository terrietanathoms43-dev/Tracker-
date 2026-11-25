import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workflowPolicyAttachments } from "@/db/schema";
import { listWorkflowPolicies } from "@/lib/dal/workflow-policies";
import { WorkflowPolicyControls } from "./workflow-policy-controls";

export async function WorkflowPolicySection({ orgId, kind, id }: { orgId: string; kind: "workspace" | "project" | "goal"; id: string }) {
  const [policies, attachments] = await Promise.all([
    listWorkflowPolicies(orgId),
    db.select({ policyId: workflowPolicyAttachments.policyId }).from(workflowPolicyAttachments).where(and(eq(workflowPolicyAttachments.orgId, orgId), eq(workflowPolicyAttachments.scopeKind, kind), eq(workflowPolicyAttachments.scopeId, id))),
  ]);
  return <WorkflowPolicyControls scope={{ kind, id }} policies={policies.map(({ id, name }) => ({ id, name }))} attached={attachments.map((a) => a.policyId)} />;
}
