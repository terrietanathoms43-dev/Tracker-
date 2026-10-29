"use client";

import {
   defaultDropAnimationSideEffects,
   DndContext,
   DragOverlay,
   KeyboardSensor,
   MeasuringStrategy,
   PointerSensor,
   useSensor,
   useSensors,
   type DragEndEvent,
   type DragStartEvent,
   type DropAnimation,
   type UniqueIdentifier,
} from "@dnd-kit/core";
import {
   arrayMove,
   defaultAnimateLayoutChanges,
   horizontalListSortingStrategy,
   SortableContext,
   sortableKeyboardCoordinates,
   useSortable,
   type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import Link from "next/link";
import { useId, useRef, useState, type MutableRefObject } from "react";
import { HOME_TAB_LABELS, HOME_TABS_COOKIE, type HomeTab, type HomeTabConfig } from "@/lib/home-tabs";

// The tab row under the /home header (docs/PLAN.md §2): Home · List · Board · Projects, in the order the
// person chose — hold a tab and pull it sideways to reorder, the same sortable machinery as the board
// (components/kanban.tsx). The active tab's underline is one of the few places the gold highlight appears
// (PLAN §9). The order lives in the trackwise.homeTabs cookie — a browser preference, not data
// (lib/home-tabs.ts); the first tab is where a bare /home opens.

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function writeConfig(config: HomeTabConfig) {
  document.cookie = `${HOME_TABS_COOKIE}=${encodeURIComponent(JSON.stringify(config))}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

// The same smoothness ingredients the kanban uses: droppables measured every frame, tabs animated into
// place after a drop.
const measuringConfig = { droppable: { strategy: MeasuringStrategy.Always } };
const animateLayoutChanges: AnimateLayoutChanges = (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true });
const dropAnimationConfig: DropAnimation = { sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }) };

const tabClass = (on: boolean) =>
  cn(
    "relative -mb-px flex h-9 items-center border-b-2 text-base font-medium transition-colors",
    on ? "border-highlight text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
  );

/**
 * A tab, built like a board card: the sortable listeners go on the wrapper (the grab surface), the link
 * inside stays a plain link, and what follows the pointer is a DragOverlay clone — never the real link.
 * A click fires on the common ancestor of pointerdown and pointerup; with the overlay the release lands on
 * the clone, so a finished drag can never count as clicking the tab. Below 10px it simply stays a click.
 */
function SortableTab({ tab, active, href, lastDrop }: { tab: HomeTab; active: boolean; href: string; lastDrop: MutableRefObject<number> }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id: tab, animateLayoutChanges });
  return (
    <div
      ref={setNodeRef}
      // Translate, not Transform: scale would stretch the label while it glides.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative touch-none select-none", isDragging ? "z-10 cursor-grabbing opacity-40" : "cursor-grab")}
      {...attributes}
      {...listeners}
    >
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        // The pointerup of a finished drag can still resolve to this link: swallow the click it produces.
        onClick={(event) => {
          if (Date.now() - lastDrop.current < 300) event.preventDefault();
        }}
        className={cn(tabClass(active), "outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      >
        {HOME_TAB_LABELS[tab]}
      </Link>
    </div>
  );
}

/** The clone that follows the pointer while a tab is dragged — a chip, not a link, so it can't navigate. */
function TabOverlay({ tab }: { tab: HomeTab }) {
  return <div className={cn(tabClass(true), "w-fit")}>{HOME_TAB_LABELS[tab]}</div>;
}

/**
 * List and Board keep the current filters (`query`, without `view`) so switching keeps the same tasks in view.
 * `config` is the server-read cookie, so the first render already shows the person's own order.
 */
export function ViewTabs({ active, query = "", config }: { active: HomeTab; query?: string; config: HomeTabConfig }) {
  const [state, setState] = useState(config);
  // Same pattern as TaskToolbar: when a fresh server render brings a different cookie, the row follows it.
  const [prev, setPrev] = useState(config);
  if (config !== prev) {
    setPrev(config);
    setState(config);
  }
  const [dragged, setDragged] = useState<UniqueIdentifier | null>(null);
  const lastDrop = useRef(0);
  const dndId = useId();
  // Same constraint as the board: 10px of movement starts a drag, less stays a click.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragStart = ({ active: draggedItem }: DragStartEvent) => setDragged(draggedItem.id);
  const dragEnd = ({ active: draggedItem, over }: DragEndEvent) => {
    setDragged(null);
    lastDrop.current = Date.now();
    if (over === null || draggedItem.id === over.id) return;
    const next = { order: arrayMove(state.order, state.order.indexOf(draggedItem.id as HomeTab), state.order.indexOf(over.id as HomeTab)) };
    setState(next);
    writeConfig(next);
  };

  const hrefFor = (tab: HomeTab): string => {
    const params = new URLSearchParams(query);
    params.set("view", tab);
    return `/home?${params}`;
  };

  if (state.order.length <= 1) return null;
  return (
    <DndContext id={dndId} sensors={sensors} measuring={measuringConfig} onDragStart={dragStart} onDragEnd={dragEnd} onDragCancel={() => setDragged(null)}>
      <nav aria-label="Sections" className="-mt-2 mb-5 flex gap-5 border-b">
        <SortableContext items={state.order} strategy={horizontalListSortingStrategy}>
          {state.order.map((tab) => (
            <SortableTab key={tab} tab={tab} active={tab === active} href={hrefFor(tab)} lastDrop={lastDrop} />
          ))}
        </SortableContext>
      </nav>
      <DragOverlay dropAnimation={dropAnimationConfig}>
        {dragged !== null ? <TabOverlay tab={dragged as HomeTab} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
