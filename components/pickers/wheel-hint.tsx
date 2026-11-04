"use client";

import { Mouse } from "lucide-react";
import type { ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The tooltip on every dropdown that steps with the mouse wheel (components/pickers/use-wheel-step.ts): hovering
 * one says it can be scrolled. Mouse only: Radix tooltips don't open on touch. The child must take a ref.
 * `disabled` keeps it shut without changing the tree, so the control never remounts (and keeps its focus).
 */
export function WheelHint({
  children,
  disabled = false,
}: {
  children: ReactElement;
  disabled?: boolean;
}) {
  return (
    <Tooltip open={disabled ? false : undefined}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-1.5">
        <Mouse className="size-3" aria-hidden />
        Scroll to change
      </TooltipContent>
    </Tooltip>
  );
}
