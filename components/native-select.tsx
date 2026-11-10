"use client";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * A real <select>, styled like Input: right for long lists (timezones), phones, and scripted tests.
 * The Radix Select stays available for short pickers that need richer items.
 *
 * The open list is the browser's own: `scheme-dark` tells it to draw dark chrome in dark mode, and the option
 * colours reach every option, grouped ones included (`[&_option]`, not `[&>option]`), so a list with
 * <optgroup> headings reads like the rest of the page in both themes.
 *
 * It opens on click or keyboard only. The mouse wheel over it scrolls the page, never the value (the
 * "scroll to change" stepping was taken out on 2026-11-07: a wheel drifting over a dropdown changed values by accident).
 */
export function NativeSelect({ className, children, ref, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...props}
        ref={ref}
        className={cn(
          "h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent pr-8 pl-3 text-base outline-none transition-[color,box-shadow] md:text-base dark:bg-input/30 dark:scheme-dark",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
          "[&_option]:bg-popover [&_option]:text-popover-foreground [&_optgroup]:bg-popover [&_optgroup]:font-medium [&_optgroup]:text-muted-foreground",
        )}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
