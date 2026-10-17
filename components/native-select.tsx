import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * A real <select>, styled like Input: right for long lists (timezones), phones, and scripted tests.
 * The Radix Select stays available for short pickers that need richer items.
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...props}
        className={cn(
          "h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent pr-8 pl-3 text-base outline-none transition-[color,box-shadow] md:text-sm dark:bg-input/30",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
          "[&>option]:bg-popover [&>option]:text-popover-foreground",
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
