"use client";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import type { ComponentProps, Ref } from "react";
import { useWheelStep } from "@/components/pickers/use-wheel-step";
import { WheelHint } from "@/components/pickers/wheel-hint";

/**
 * A real <select>, styled like Input: right for long lists (timezones), phones, and scripted tests.
 * The Radix Select stays available for short pickers that need richer items.
 *
 * The open list is the browser's own: `scheme-dark` tells it to draw dark chrome in dark mode, and the option
 * colours reach every option, grouped ones included (`[&_option]`, not `[&>option]`), so a list with
 * <optgroup> headings reads like the rest of the page in both themes.
 *
 * It still opens on click; the mouse wheel over it (closed) also steps through the options, firing the same
 * change event a pick does (components/pickers/use-wheel-step.ts).
 */
export function NativeSelect({
  className,
  children,
  ref,
  ...props
}: ComponentProps<"select">) {
  const wheelRef = useWheelStep<HTMLSelectElement>((direction, select) => {
    if (select.multiple) return;
    const options = Array.from(select.options);
    let index = select.selectedIndex;
    do index += direction;
    while (
      index >= 0 &&
      index < options.length &&
      (options[index].disabled ||
        (options[index].parentElement as HTMLOptGroupElement | null)?.disabled)
    );
    if (index < 0 || index >= options.length || index === select.selectedIndex)
      return;
    select.selectedIndex = index;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, !props.disabled);

  return (
    <div className={cn("relative", className)}>
      <WheelHint disabled={Boolean(props.disabled) || Boolean(props.multiple)}>
        <select
          {...props}
          ref={(node) => {
            const detachWheel = wheelRef(node);
            const detachRef = assignRef(ref, node);
            return () => {
              detachWheel?.();
              detachRef();
            };
          }}
          className={cn(
            "h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent pr-8 pl-3 text-base outline-none transition-[color,box-shadow] md:text-base dark:bg-input/30 dark:scheme-dark",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
            "[&_option]:bg-popover [&_option]:text-popover-foreground [&_optgroup]:bg-popover [&_optgroup]:font-medium [&_optgroup]:text-muted-foreground",
          )}
        >
          {children}
        </select>
      </WheelHint>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/** Hands the node to the caller's ref; the returned cleanup clears it again (React 19 ref cleanups). */
function assignRef<T>(ref: Ref<T> | undefined, node: T | null): () => void {
  if (typeof ref === "function") {
    const cleanup = ref(node);
    return typeof cleanup === "function" ? cleanup : () => ref(null);
  }
  if (ref) (ref as { current: T | null }).current = node;
  return () => {
    if (ref) (ref as { current: T | null }).current = null;
  };
}
