import "server-only";
import { eq } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db";
import { workflowPolicies, workflowPolicyAttachments } from "@/db/schema";
import { resolvePolicyApplications, type PolicyPlacement } from "@/lib/tasks/workflow-policies";

/** Read applicable definitions and attachments for a validated task placement. Both queries are org-scoped. */
export async function workflowPoliciesForPlacement(placement: PolicyPlacement, executor: Db | Tx = db) {
  const [policies, attachments] = await Promise.all([
    executor.select().from(workflowPolicies).where(eq(workflowPolicies.orgId, placement.orgId)),
    executor.select().from(workflowPolicyAttachments).where(eq(workflowPolicyAttachments.orgId, placement.orgId)),
  ]);
  return resolvePolicyApplications(policies, attachments, placement);
}
