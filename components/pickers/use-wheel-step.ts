"use client";

import { useCallback, useEffect, useRef } from "react";

// Hover a closed dropdown and turn the mouse wheel to step through its choices: down for the next one, up for the
// previous one. Clicking still opens the list. Used by NativeSelect and the project and goal pickers.
//
// A wheel gesture that began elsewhere (scrolling the page past a dropdown) is left alone, so a page scroll never
// changes a value by drifting over one.

/** Wheel movement (px) that counts as one step; trackpads send many small deltas. */
const STEP_DELTA = 40;
/** A pause longer than this between wheel events starts a new gesture. */
const GESTURE_GAP_MS = 350;

// The capture listener runs before a dropdown's own, so previousWheel is the event before the one being handled.
let latestWheel = { at: 0, target: null as EventTarget | null };
let previousWheel = latestWheel;
let listening = false;
function trackPageWheel() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener(
    "wheel",
    (event) => {
      previousWheel = latestWheel;
      latestWheel = { at: event.timeStamp, target: event.target };
    },
    { capture: true, passive: true },
  );
}

/**
 * Calls `step(1)` / `step(-1)` (with the element) as the wheel turns over it; at the first or last choice it simply
 * stays. `enabled` false (disabled, or the list is open) lets the wheel through untouched. Returns a callback ref.
 */
export function useWheelStep<T extends HTMLElement>(
  step: (direction: 1 | -1, element: T) => void,
  enabled = true,
) {
  const latest = useRef({ step, enabled });
  useEffect(() => {
    latest.current = { step, enabled };
  });

  return useCallback((element: T | null) => {
    if (!element) return;
    trackPageWheel();
    let accumulated = 0;
    let ownGesture = false;
    let previousAt = 0;

    function onWheel(event: WheelEvent) {
      if (!element || !latest.current.enabled || event.ctrlKey) return;
      const sameGesture = event.timeStamp - previousAt < GESTURE_GAP_MS;
      previousAt = event.timeStamp;
      if (!sameGesture) {
        // A new gesture belongs to this dropdown only if the page wasn't already scrolling under the pointer.
        const pageWasScrolling =
          event.timeStamp - previousWheel.at < GESTURE_GAP_MS &&
          !element.contains(previousWheel.target as Node | null);
        ownGesture = !pageWasScrolling;
        accumulated = 0;
      }
      if (!ownGesture) return;
      event.preventDefault();

      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      // Mouse wheels in line or page mode report small numbers: count each notch as a step.
      accumulated +=
        event.deltaMode === 0 ? delta : Math.sign(delta) * STEP_DELTA;
      if (Math.abs(accumulated) < STEP_DELTA) return;
      const direction = accumulated > 0 ? 1 : -1;
      accumulated = 0;
      latest.current.step(direction, element);
    }

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);
}

/** The next value in `values` from `current`, or null at either end. */
export function stepThrough(
  values: string[],
  current: string,
  direction: 1 | -1,
): string | null {
  if (values.length === 0) return null;
  const index = values.indexOf(current);
  const next =
    index === -1
      ? direction === 1
        ? 0
        : values.length - 1
      : index + direction;
  return next >= 0 && next < values.length ? values[next] : null;
}
