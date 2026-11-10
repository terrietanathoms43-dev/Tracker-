"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, useTransition } from "react";
import { setHomeTabOrder } from "@/actions/config";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import type { OrgRole } from "@/lib/constants";
import { HOME_TAB_LABELS, resolveTabConfig, type HomeTab } from "@/lib/home-tabs";
import { toastResult } from "@/lib/toast-result";
import { Section } from "./section";

// Admins: the workspace's default /home tab order, per role — the first tab is where that role lands.
// A person's own browser may still reorder theirs; this is the default they start from. Stakeholders
// only ever have Overview, so they are not listed.

const ROLES: { value: OrgRole; label: string }[] = [
  { value: "member", label: "Members" },
  { value: "leader", label: "Leaders" },
  { value: "admin", label: "Admins" },
];

export function TabOrderCard(props: { orders: Partial<Record<OrgRole, string[]>> }) {
  const [role, setRole] = useState<OrgRole>("member");
  const [orders, setOrders] = useState(props.orders);
  const [order, setOrder] = useState<HomeTab[]>(() => resolveTabConfig({}, "member", props.orders).order);
  const [pending, startTransition] = useTransition();
  const saved = resolveTabConfig({}, role, orders).order;
  const dirty = order.join() !== saved.join();

  const pick = (next: OrgRole) => {
    setRole(next);
    setOrder(resolveTabConfig({}, next, orders).order);
  };

  const move = (index: number, by: -1 | 1) => {
    setOrder((current) => {
      const next = [...current];
      const [tab] = next.splice(index, 1);
      next.splice(index + by, 0, tab);
      return next;
    });
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
      <ul className="divide-y">
        {order.map((tab, index) => (
          <li key={tab} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
            <span className="text-sm font-medium">
              {HOME_TAB_LABELS[tab]}
              {index === 0 ? <span className="ml-2 text-xs font-normal text-muted-foreground">lands here</span> : null}
            </span>
            <span className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Move ${HOME_TAB_LABELS[tab]} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp className="size-4" aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Move ${HOME_TAB_LABELS[tab]} down`} disabled={index === order.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown className="size-4" aria-hidden />
              </Button>
            </span>
          </li>
        ))}
      </ul>
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
