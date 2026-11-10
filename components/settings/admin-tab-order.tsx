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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import { GripVertical } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { setHomeTabOrder } from "@/actions/config";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import type { OrgRole } from "@/lib/constants";
import { HOME_TAB_LABELS, resolveTabConfig, type HomeTab } from "@/lib/home-tabs";
import { toastResult } from "@/lib/toast-result";
import { Section } from "./section";

// Admins: the workspace's default /home tab order, per role — the first tab is where that role lands.
// Rows drag to reorder with the same sortable machinery as the tab row and the board (view-tabs.tsx).
// A person's own browser may still reorder theirs; this is the default they start from. Stakeholders
// only ever have Overview, so they are not listed.

const ROLES: { value: OrgRole; label: string }[] = [
  { value: "member", label: "Members" },
  { value: "leader", label: "Leaders" },
  { value: "admin", label: "Admins" },
];

// The same smoothness ingredients the tab row uses: droppables measured every frame, rows animated into place.
const measuringConfig = { droppable: { strategy: MeasuringStrategy.Always } };
const animateLayoutChanges: AnimateLayoutChanges = (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true });
const dropAnimationConfig: DropAnimation = { sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }) };

const rowClass = "flex items-center gap-3 px-4 py-2.5 sm:px-5";

/** A tab row, built like a board card: the listeners go on the row (the grab surface); the overlay is a clone. */
function SortableTabRow({ tab, first }: { tab: HomeTab; first: boolean }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id: tab, animateLayoutChanges });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(rowClass, "touch-none select-none", isDragging ? "z-10 cursor-grabbing opacity-40" : "cursor-grab")}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-sm font-medium">
        {HOME_TAB_LABELS[tab]}
        {first ? <span className="ml-2 text-xs font-normal text-muted-foreground">lands here</span> : null}
      </span>
    </div>
  );
}

function TabOverlay({ tab }: { tab: HomeTab }) {
  return (
    <div className={cn(rowClass, "w-fit rounded-md border bg-card shadow-sm")}>
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-sm font-medium">{HOME_TAB_LABELS[tab]}</span>
    </div>
  );
}

export function TabOrderCard(props: { orders: Partial<Record<OrgRole, string[]>> }) {
  const [role, setRole] = useState<OrgRole>("member");
  const [orders, setOrders] = useState(props.orders);
  const [order, setOrder] = useState<HomeTab[]>(() => resolveTabConfig({}, "member", props.orders).order);
  const [dragged, setDragged] = useState<UniqueIdentifier | null>(null);
  const [pending, startTransition] = useTransition();
  const dndId = useId();
  const saved = resolveTabConfig({}, role, orders).order;
  const dirty = order.join() !== saved.join();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const pick = (next: OrgRole) => {
    setRole(next);
    setOrder(resolveTabConfig({}, next, orders).order);
  };

  const dragEnd = ({ active: item, over }: DragEndEvent) => {
    setDragged(null);
    if (over === null || item.id === over.id) return;
    setOrder(arrayMove(order, order.indexOf(item.id as HomeTab), order.indexOf(over.id as HomeTab)));
  };

  const save = (next: HomeTab[]) =>
    startTransition(async () => {
      if (toastResult(await setHomeTabOrder({ role, order: next }))) {
        const merged = { ...orders };
        if (next.length > 0) merged[role] = next;
        else delete merged[role];
        setOrders(merged);
        setOrder(next.length > 0 ? next : resolveTabConfig({}, role, merged).order);
      }
    });

  return (
    <Section id="tab-order" title="Home tabs" description="The order each role lands in; the first tab is the landing. People can still rearrange their own tabs — this sets their default.">
      <div className="border-b px-4 py-3 sm:px-5">
        <NativeSelect aria-label="Role" className="sm:w-44" value={role} onChange={(event) => pick(event.target.value as OrgRole)}>
          {ROLES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <DndContext id={dndId} sensors={sensors} measuring={measuringConfig} onDragStart={({ active }: DragStartEvent) => setDragged(active.id)} onDragEnd={dragEnd} onDragCancel={() => setDragged(null)}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="divide-y">
            {order.map((tab, index) => (
              <SortableTabRow key={tab} tab={tab} first={index === 0} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={dropAnimationConfig}>{dragged !== null ? <TabOverlay tab={dragged as HomeTab} /> : null}</DragOverlay>
      </DndContext>
      <div className="flex justify-end gap-2 border-t px-4 py-3 sm:px-5">
        <Button type="button" variant="ghost" size="sm" disabled={pending || orders[role] === undefined} onClick={() => save([])}>
          Reset to built-in
        </Button>
        <Button type="button" size="sm" disabled={pending || !dirty} onClick={() => save(order)}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
