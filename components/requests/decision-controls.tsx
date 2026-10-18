"use client";

import { cn } from "cn";
import { ArrowRight, Check, ChevronDown, Pause, RotateCcw, X, type LucideIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { RequestDecision } from "@/lib/constants";
import { DECISION_LABELS, decisionsFor } from "@/lib/requests/decisions";
import { DecisionDialog, type DecisionTarget } from "./decision-dialog";

// A leader's decision controls for one request: a compact "Decide" menu on rows, a row of buttons on the request
// page. Both offer exactly what lib/requests/decisions.ts allows for the request's status, and open the same dialog.

const ICONS: Record<RequestDecision, LucideIcon> = {
  approved: Check,
  deferred: Pause,
  rejected: X,
  converted: ArrowRight,
  reopened: RotateCcw,
};

/** Forward decisions first, rejecting last (it sits behind a separator in the menu). */
const ORDER: RequestDecision[] = ["converted", "approved", "reopened", "deferred", "rejected"];

function offered(target: DecisionTarget): RequestDecision[] {
  const allowed = decisionsFor(target.status);
  return ORDER.filter((decision) => allowed.includes(decision));
}

/** "Defer again" reads better than "Defer" on something already deferred. */
const labelFor = (decision: RequestDecision, target: DecisionTarget) => (decision === "deferred" && target.status === "deferred" ? "Defer again" : DECISION_LABELS[decision]);

/**
 * The row's controls: an approved request gets its Convert to task button in plain sight, and everything else sits in
 * a small "Decide" menu (a lone choice, like Reopen on a rejected request, is just a button). Nothing renders for a
 * converted request.
 */
export function DecideMenu({ request, className }: { request: DecisionTarget; className?: string }) {
  const [decision, setDecision] = useState<RequestDecision | null>(null);
  const decisions = offered(request);
  if (decisions.length === 0) return null;
  const inPlainSight: RequestDecision[] =
    decisions.length === 1 ? decisions : request.status === "approved" ? decisions.filter((each) => each === "converted") : [];
  const inMenu = decisions.filter((each) => !inPlainSight.includes(each));

  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      {inPlainSight.map((each) => {
        const Icon = ICONS[each];
        return (
          <Button key={each} size="sm" variant="outline" aria-label={`${labelFor(each, request)}: ${request.title}`} onClick={() => setDecision(each)}>
            <Icon aria-hidden />
            {labelFor(each, request)}
          </Button>
        );
      })}
      {inMenu.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant={inPlainSight.length > 0 ? "ghost" : "outline"} aria-label={`${inPlainSight.length > 0 ? "More decisions" : "Decide"} on ${request.title}`}>
              {inPlainSight.length > 0 ? "More" : "Decide"}
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {inMenu.map((each) => {
              const Icon = ICONS[each];
              return (
                <Fragment key={each}>
                  {each === "rejected" && inMenu.length > 1 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem variant={each === "rejected" ? "destructive" : "default"} onSelect={() => setDecision(each)}>
                    <Icon />
                    {labelFor(each, request)}…
                  </DropdownMenuItem>
                </Fragment>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DecisionDialog request={request} decision={decision} onClose={() => setDecision(null)} />
    </div>
  );
}

/** The request page's controls: every allowed decision as a button, the first one (the step forward) primary. */
export function DecisionButtons({ request }: { request: DecisionTarget }) {
  const [decision, setDecision] = useState<RequestDecision | null>(null);
  const decisions = offered(request);
  if (decisions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {decisions.map((each, index) => {
        const Icon = ICONS[each];
        return (
          <Button
            key={each}
            variant={index === 0 ? "default" : "outline"}
            className={each === "rejected" ? "text-destructive hover:text-destructive" : undefined}
            onClick={() => setDecision(each)}
          >
            <Icon aria-hidden />
            {labelFor(each, request)}
          </Button>
        );
      })}
      <DecisionDialog request={request} decision={decision} onClose={() => setDecision(null)} />
    </div>
  );
}
