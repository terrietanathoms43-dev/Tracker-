import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DecisionButtons } from "@/components/requests/decision-controls";
import { LinkedTask } from "@/components/requests/linked-task";
import { DecisionHistory, DecisionSummary, RequestAsk, RequestHeader } from "@/components/requests/request-detail";
import { getRequest } from "@/lib/dal/requests";
import { getTask, listLinks } from "@/lib/dal/tasks";
import { canDecideRequest, canReadRequest, canReadTask, type Viewer } from "@/lib/permissions";
import { decisionsFor, phraseDecisions } from "@/lib/requests/decisions";
import { dayKey } from "@/lib/time";
import { requireViewer } from "@/lib/viewer";

// /requests/[id]: one request, its decision, the task it became, and every decision made on it.

export const metadata: Metadata = { title: "Request" };

/** The task a converted request became, when the viewer may read it (its Resume card is shown read-only). */
async function linkedTask(viewer: Viewer, taskId: string | null) {
  if (taskId === null) return null;
  const [found, links] = await Promise.all([getTask(viewer, taskId), listLinks(viewer, taskId)]);
  return found !== null && canReadTask(viewer, found.scope) ? { detail: found.detail, links } : null;
}

/**
 * "What did I ask for, what was decided, and what's being delivered?" (docs/BRIEF.md §3) answered top down: the
 * decision as it stands (with a leader's controls), the linked task, the ask, then the decision history.
 * A request from another workspace, or someone else's for a stakeholder, is simply not found.
 */
export default async function RequestPage(props: PageProps<"/requests/[id]">) {
  const { id } = await props.params;
  const viewer = await requireViewer();
  const found = await getRequest(viewer, id);
  if (found === null || !canReadRequest(viewer, found.scope)) notFound();
  const { detail } = found;
  const task = await linkedTask(viewer, detail.taskId);
  const now = new Date();
  const today = dayKey(now, viewer.timezone);
  const clock = { now, timeZone: viewer.timezone };
  const decidable = canDecideRequest(viewer) && decisionsFor(detail.status).length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <RequestHeader detail={detail} {...clock} />
      <div className="grid gap-5">
        <DecisionSummary
          detail={detail}
          today={today}
          {...clock}
          controls={decidable ? <DecisionButtons request={{ id: detail.id, title: detail.title, status: detail.status, urgency: detail.urgency }} /> : null}
        />
        {task ? <LinkedTask detail={task.detail} links={task.links} {...clock} /> : null}
        <RequestAsk detail={detail} />
        <DecisionHistory decisions={phraseDecisions(detail.decisions, detail, today)} {...clock} />
      </div>
    </div>
  );
}
