"use client";

import { useRef } from "react";

// Touch long-press for rows and cards, so no action depends on hover.

/**
 * A 500ms touch press that opens a row's or card's action sheet (apex-ux §10: nothing depends on hover).
 * Spread `handlers` on the element; call `swallowClick` from the link's onClick so the press doesn't also navigate.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const pressed = useRef(false);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const handlers = {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pressed.current = false;
      timer.current = window.setTimeout(() => {
        pressed.current = true;
        onLongPress();
      }, 500);
    },
    onPointerUp: cancel,
    onPointerMove: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      if (pressed.current) event.preventDefault();
    },
  };

  const swallowClick = (event: React.MouseEvent) => {
    if (!pressed.current) return;
    event.preventDefault();
    pressed.current = false;
  };

  return { handlers, swallowClick };
}
