"use client";

import type { CSSProperties, ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";

import type {
   DragEndEvent,
   DragOverEvent,
   DragStartEvent,
   DropAnimation,
   Modifiers,
   UniqueIdentifier,
   DraggableAttributes,
   DraggableSyntheticListeners,
} from "@dnd-kit/core";

import {
   DndContext,
   DragOverlay,
   KeyboardSensor,
   MeasuringStrategy,
   PointerSensor,
   useSensor,
   useSensors,
   defaultDropAnimationSideEffects,
} from "@dnd-kit/core";

import {
   arrayMove,
   defaultAnimateLayoutChanges,
   rectSortingStrategy,
   SortableContext,
   sortableKeyboardCoordinates,
   useSortable,
   verticalListSortingStrategy,
   type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";

// A generic drag-and-drop kanban (reui.io's kanban, adapted: no base-ui — plain elements instead of
// useRender/mergeProps). Kanban holds the DndContext; KanbanColumn is a droppable column (draggable only
// when something renders a KanbanColumnHandle), KanbanItem a draggable card, KanbanItemHandle the part a
// pointer grabs, KanbanOverlay the floating clone that follows the pointer. PointerSensor needs 10px of
// movement, so a click on a card still works — and on touch the browser's scroll wins the pointer, which
// leaves long-press as the touch gesture.
//
// `onMove` hands a finished item drop to the consumer instead of applying it: the board uses it so a
// cross-column drop can ask for what a status needs (a reason, an approver) before it commits.

const measuringConfig = {
   droppable: { strategy: MeasuringStrategy.Always },
};

const pointerActivationConstraint = { distance: 10 };

interface KanbanContextValue {
   columns: Record<string, unknown[]>;
   setColumns: (columns: Record<string, unknown[]>) => void;
   getItemId: (item: unknown) => string;
   columnIds: string[];
   activeId: UniqueIdentifier | null;
   setActiveId: (id: UniqueIdentifier | null) => void;
   findContainer: (id: UniqueIdentifier) => string | undefined;
   isColumn: (id: UniqueIdentifier) => boolean;
   modifiers?: Modifiers;
   /** `onMove` is set: item drops belong to the consumer, so items are never drop targets — only columns. */
   delegatesMoves: boolean;
}

const KanbanContext = createContext<KanbanContextValue>({
   columns: {},
   setColumns: () => {},
   getItemId: () => "",
   columnIds: [],
   activeId: null,
   setActiveId: () => {},
   findContainer: () => undefined,
   isColumn: () => false,
   modifiers: undefined,
   delegatesMoves: false,
});

const ColumnContext = createContext<{
   attributes: DraggableAttributes;
   listeners: DraggableSyntheticListeners | undefined;
   isDragging?: boolean;
   disabled?: boolean;
}>({
   attributes: {} as DraggableAttributes,
   listeners: undefined,
   isDragging: false,
   disabled: false,
});

const ItemContext = createContext<{
   attributes: DraggableAttributes;
   listeners: DraggableSyntheticListeners | undefined;
   isDragging?: boolean;
   disabled?: boolean;
}>({
   attributes: {} as DraggableAttributes,
   listeners: undefined,
   isDragging: false,
   disabled: false,
});

const IsOverlayContext = createContext(false);

const animateLayoutChanges: AnimateLayoutChanges = (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true });

const dropAnimationConfig: DropAnimation = {
   sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: "0.4" } },
   }),
};

export interface KanbanMoveEvent {
   event: DragEndEvent;
   activeContainer: string;
   activeIndex: number;
   overContainer: string;
   overIndex: number;
}

export interface KanbanRootProps<T> extends Omit<ComponentProps<"div">, "children"> {
   value: Record<string, T[]>;
   onValueChange: (value: Record<string, T[]>) => void;
   getItemValue: (item: T) => string;
   children: ReactNode;
   onMove?: (event: KanbanMoveEvent) => void;
   modifiers?: Modifiers;
}

function Kanban<T>({ value, onValueChange, getItemValue, children, className, onMove, modifiers, ...props }: KanbanRootProps<T>) {
   const columns = value;
   const setColumns = onValueChange;
   const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

   // Refs so all callbacks read the latest values without being recreated on every render.
   // This breaks the cascade: columns change → callbacks recreate → DndContext re-registers → loop.
   // Refs let every callback read the latest values without being recreated on each render — that
   // breaks the cascade (columns change → callbacks recreate → DndContext re-registers → loop). They
   // are written after commit, never during render.
   const columnsRef = useRef(columns);
   const getItemValueRef = useRef(getItemValue);
   const onMoveRef = useRef(onMove);

   useEffect(() => {
      columnsRef.current = columns;
      getItemValueRef.current = getItemValue;
      onMoveRef.current = onMove;
   });

   // Sensor config objects are stable module-level constants, so useSensors result is stable.
   const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: pointerActivationConstraint }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
   );

   const columnIds = useMemo(() => Object.keys(columns), [columns]);

   // isColumn only depends on columnIds (the keys, not the item arrays). Column keys don't
   // change when items are moved, so columnIds array values are stable during drags.
   const isColumn = useCallback((id: UniqueIdentifier) => columnIds.includes(id as string), [columnIds]);

   // findContainer reads columnsRef so it doesn't need columns or getItemValue in its deps.
   const findContainer = useCallback(
      (id: UniqueIdentifier) => {
         if (isColumn(id)) return id as string;
         const cols = columnsRef.current;
         const getId = getItemValueRef.current;

         return Object.keys(cols).find((key) => cols[key].some((item) => getId(item) === id));
      },
      [isColumn],
   );

   const handleDragStart = useCallback((event: DragStartEvent) => {
      setActiveId(event.active.id);
   }, []);

   // RAF refs throttle onDragOver: we only process the latest event per animation frame.
   // This prevents React from receiving dozens of setState calls per frame during rapid drags,
   // which is what causes "Maximum update depth exceeded".
   const dragOverRafRef = useRef<number | null>(null);
   const pendingDragOverRef = useRef<DragOverEvent | null>(null);

   const handleDragOver = useCallback(
      (event: DragOverEvent) => {
         if (onMoveRef.current) return;

         // Always capture the latest event; only one RAF runs at a time.
         pendingDragOverRef.current = event;
         if (dragOverRafRef.current !== null) return;

         dragOverRafRef.current = requestAnimationFrame(() => {
            dragOverRafRef.current = null;
            const latestEvent = pendingDragOverRef.current;

            pendingDragOverRef.current = null;
            if (!latestEvent) return;

            const { active, over } = latestEvent;

            if (!over) return;
            if (isColumn(active.id)) return;

            const activeContainer = findContainer(active.id);
            const overContainer = findContainer(over.id);

            // Only reorder within the same column during drag. Cross-column moves are
            // committed in onDragEnd instead — moving an item to another column unmounts
            // its DOM node and remounts it, which releases pointer capture and causes the
            // drag to end prematurely when the kanban is rendered inside an iframe.
            if (!activeContainer || !overContainer || activeContainer !== overContainer) return;

            const cols = columnsRef.current;
            const getId = getItemValueRef.current;
            const activeIndex = cols[activeContainer].findIndex((item: T) => getId(item) === active.id);
            const overIndex = cols[overContainer].findIndex((item: T) => getId(item) === over.id);

            if (activeIndex === overIndex) return;

            setColumns({
               ...cols,
               [activeContainer]: arrayMove(cols[activeContainer], activeIndex, overIndex),
            });
         });
      },
      [findContainer, isColumn, setColumns],
   );

   const flushPendingDragOver = useCallback(() => {
      if (dragOverRafRef.current !== null) {
         cancelAnimationFrame(dragOverRafRef.current);
         dragOverRafRef.current = null;
      }

      pendingDragOverRef.current = null;
   }, []);

   const handleDragCancel = useCallback(() => {
      flushPendingDragOver();
      setActiveId(null);
   }, [flushPendingDragOver]);

   const handleDragEnd = useCallback(
      (event: DragEndEvent) => {
         flushPendingDragOver();

         const { active, over } = event;

         setActiveId(null);

         if (!over) return;

         if (onMoveRef.current && !isColumn(active.id)) {
            const cols = columnsRef.current;
            const getId = getItemValueRef.current;
            const activeContainer = findContainer(active.id);
            const overContainer = findContainer(over.id);

            if (activeContainer && overContainer) {
               const activeIndex = cols[activeContainer].findIndex((item: T) => getId(item) === active.id);

               const overIndex = isColumn(over.id)
                  ? cols[overContainer].length
                  : cols[overContainer].findIndex((item: T) => getId(item) === over.id);

               onMoveRef.current({ event, activeContainer, activeIndex, overContainer, overIndex });
            }

            return;
         }

         if (isColumn(active.id) && isColumn(over.id)) {
            const cols = columnsRef.current;
            const keys = Object.keys(cols);
            const activeIndex = keys.indexOf(active.id as string);
            const overIndex = keys.indexOf(over.id as string);

            if (activeIndex !== overIndex) {
               const newOrder = arrayMove(keys, activeIndex, overIndex);
               const newColumns: Record<string, T[]> = {};

               newOrder.forEach((key) => {
                  newColumns[key] = cols[key];
               });

               setColumns(newColumns);
            }

            return;
         }

         const activeContainer = findContainer(active.id);
         const overContainer = findContainer(over.id);

         if (!activeContainer || !overContainer) return;

         const cols = columnsRef.current;
         const getId = getItemValueRef.current;
         const activeIndex = cols[activeContainer].findIndex((item: T) => getId(item) === active.id);

         if (activeContainer === overContainer) {
            const overIndex = cols[overContainer].findIndex((item: T) => getId(item) === over.id);

            if (activeIndex !== overIndex) {
               setColumns({
                  ...cols,
                  [activeContainer]: arrayMove(cols[activeContainer], activeIndex, overIndex),
               });
            }

            return;
         }

         const overItems = cols[overContainer];

         const overIndex = isColumn(over.id) ? overItems.length : overItems.findIndex((item: T) => getId(item) === over.id);

         const newActiveItems = [...cols[activeContainer]];
         const newOverItems = [...overItems];
         const [movedItem] = newActiveItems.splice(activeIndex, 1);

         newOverItems.splice(overIndex, 0, movedItem);

         setColumns({ ...cols, [activeContainer]: newActiveItems, [overContainer]: newOverItems });
      },
      [findContainer, isColumn, setColumns, flushPendingDragOver],
   );

   // Stable getItemId wrapper so context consumers don't re-render when the parent
   // passes a new inline arrow function reference.
   const stableGetItemId = useCallback((item: T) => getItemValueRef.current(item), []);

   const contextValue = useMemo(
      () =>
         ({
            columns,
            setColumns,
            getItemId: stableGetItemId,
            columnIds,
            activeId,
            setActiveId,
            findContainer,
            isColumn,
            modifiers,
            delegatesMoves: onMove !== undefined,
         }) as KanbanContextValue,
      [columns, setColumns, stableGetItemId, columnIds, activeId, findContainer, isColumn, modifiers, onMove],
   );

   return (
      <KanbanContext.Provider value={contextValue}>
         <DndContext
            sensors={sensors}
            modifiers={modifiers}
            measuring={measuringConfig}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
         >
            <div
               data-slot="kanban"
               data-dragging={activeId !== null}
               className={cn(activeId !== null && "cursor-grabbing", className)}
               {...props}
            >
               {children}
            </div>
         </DndContext>
      </KanbanContext.Provider>
   );
}

export type KanbanBoardProps = ComponentProps<"div">;

function KanbanBoard({ className, ...props }: KanbanBoardProps) {
   const { columnIds } = useContext(KanbanContext);

   return (
      <SortableContext items={columnIds} strategy={rectSortingStrategy}>
         <div data-slot="kanban-board" className={cn("grid auto-rows-fr gap-4", className)} {...props} />
      </SortableContext>
   );
}

export interface KanbanColumnProps extends ComponentProps<"div"> {
   value: string;
   disabled?: boolean;
}

function KanbanColumn({ value, className, disabled, ...props }: KanbanColumnProps) {
   const isOverlay = useContext(IsOverlayContext);
   const { activeId, isColumn, findContainer } = useContext(KanbanContext);

   const { setNodeRef, transform, transition, attributes, listeners, isDragging, isOver } = useSortable({
      id: value,
      disabled: disabled || isOverlay,
      animateLayoutChanges,
   });

   if (isOverlay) {
      return (
         <ColumnContext.Provider
            value={{
               attributes: {} as DraggableAttributes,
               listeners: undefined,
               isDragging: true,
               disabled: false,
            }}
         >
            <div
               data-slot="kanban-column"
               data-value={value}
               data-dragging
               className={cn("group/kanban-column flex flex-col", className)}
               {...props}
            />
         </ColumnContext.Provider>
      );
   }

   const isColumnDragging = activeId ? isColumn(activeId) : false;
   // Every column the dragged card could land in (anything but its own) is marked so the board can glow it.
   const dropTarget = activeId !== null && !isColumn(activeId) && findContainer(activeId) !== value;

   const style = {
      transition,
      transform: CSS.Transform.toString(transform),
   } as CSSProperties;

   return (
      <ColumnContext.Provider value={{ attributes, listeners, isDragging: isColumnDragging, disabled }}>
         <div
            data-slot="kanban-column"
            data-value={value}
            data-dragging={isDragging}
            data-over={isOver || undefined}
            data-drop-target={dropTarget || undefined}
            data-disabled={disabled}
            ref={setNodeRef}
            style={style}
            className={cn("group/kanban-column flex flex-col", isDragging && "opacity-50 z-50", disabled && "opacity-50", className)}
            {...props}
         />
      </ColumnContext.Provider>
   );
}

export interface KanbanColumnHandleProps extends ComponentProps<"div"> {
   cursor?: boolean;
}

function KanbanColumnHandle({ className, cursor = true, ...props }: KanbanColumnHandleProps) {
   const { attributes, listeners, isDragging, disabled } = useContext(ColumnContext);

   return (
      <div
         data-slot="kanban-column-handle"
         data-dragging={isDragging}
         data-disabled={disabled}
         suppressHydrationWarning
         {...attributes}
         {...listeners}
         className={cn(
            "opacity-0 transition-opacity group-hover/kanban-column:opacity-100",
            cursor && (isDragging ? "cursor-grabbing" : "cursor-grab"),
            className,
         )}
         {...props}
      />
   );
}

export interface KanbanItemProps extends ComponentProps<"div"> {
   value: string;
   disabled?: boolean;
}

function KanbanItem({ value, className, disabled, ...props }: KanbanItemProps) {
   const isOverlay = useContext(IsOverlayContext);
   const { activeId, isColumn, delegatesMoves } = useContext(KanbanContext);

   // When the consumer owns drops (onMove), only columns are drop targets: items stay still under the
   // pointer instead of jostling for a reorder that would never be saved.
   const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
      id: value,
      disabled: { draggable: disabled || isOverlay, droppable: delegatesMoves },
      animateLayoutChanges,
   });

   if (isOverlay) {
      return (
         <ItemContext.Provider
            value={{ attributes: {} as DraggableAttributes, listeners: undefined, isDragging: true, disabled: false }}
         >
            <div data-slot="kanban-item" data-value={value} data-dragging className={cn(className)} {...props} />
         </ItemContext.Provider>
      );
   }

   const isItemDragging = activeId ? !isColumn(activeId) : false;

   const style = {
      transition,
      transform: CSS.Transform.toString(transform),
   } as CSSProperties;

   // The sortable attributes and listeners go to the handle (ItemContext), not this wrapper: the grab
   // surface and its one tab stop are the card itself, so keyboard drags start where focus actually is.
   return (
      <ItemContext.Provider value={{ attributes, listeners, isDragging: isItemDragging, disabled }}>
         <div
            data-slot="kanban-item"
            data-value={value}
            data-dragging={isDragging}
            data-disabled={disabled}
            suppressHydrationWarning
            ref={setNodeRef}
            style={style}
            className={cn(isDragging && "opacity-50 z-50", disabled && "opacity-50", className)}
            {...props}
         />
      </ItemContext.Provider>
   );
}

export interface KanbanItemHandleProps extends ComponentProps<"div"> {
   cursor?: boolean;
}

function KanbanItemHandle({ className, cursor = true, ...props }: KanbanItemHandleProps) {
   const { attributes, listeners, isDragging, disabled } = useContext(ItemContext);

   return (
      <div
         data-slot="kanban-item-handle"
         data-dragging={isDragging}
         data-disabled={disabled}
         {...attributes}
         {...listeners}
         className={cn(cursor && (isDragging ? "cursor-grabbing" : "cursor-grab"), className)}
         {...props}
      />
   );
}

export interface KanbanColumnContentProps extends ComponentProps<"div"> {
   value: string;
}

function KanbanColumnContent({ value, className, ...props }: KanbanColumnContentProps) {
   const { columns, getItemId } = useContext(KanbanContext);

   const itemIds = useMemo(() => columns[value].map(getItemId), [columns, getItemId, value]);

   return (
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
         <div data-slot="kanban-column-content" className={cn("flex flex-col gap-2", className)} {...props} />
      </SortableContext>
   );
}

export interface KanbanOverlayProps extends Omit<ComponentProps<typeof DragOverlay>, "children"> {
   children?: ReactNode | ((params: { value: UniqueIdentifier; variant: "column" | "item" }) => ReactNode);
}

function KanbanOverlay({ children, className, ...props }: KanbanOverlayProps) {
   const { activeId, isColumn, modifiers } = useContext(KanbanContext);

   const variant = activeId ? (isColumn(activeId) ? "column" : "item") : "item";

   const content = activeId && children ? (typeof children === "function" ? children({ value: activeId, variant }) : children) : null;

   // DragOverlay positions its clone fixed at the viewport and renders nothing until a drag starts.
   return (
      <DragOverlay
         dropAnimation={dropAnimationConfig}
         modifiers={modifiers}
         className={cn("z-50", activeId && "cursor-grabbing", className)}
         {...props}
      >
         <IsOverlayContext.Provider value={true}>{content}</IsOverlayContext.Provider>
      </DragOverlay>
   );
}

export { Kanban, KanbanBoard, KanbanColumn, KanbanColumnHandle, KanbanItem, KanbanItemHandle, KanbanColumnContent, KanbanOverlay };
