"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, useTransition } from "react";
import { setHomeTabOrder } from "@/actions/config";
import { Button } from "@/components/ui/button";
import { HOME_TAB_LABELS, type HomeTab } from "@/lib/home-tabs";
import { toastResult } from "@/lib/toast-result";
import { Section } from "./section";

// Admins: the workspace's default /home tab order — the first tab is where everyone lands. A person's own
// browser may still reorder theirs; this is the default they start from.

export function TabOrderCard(props: { order: HomeTab[] }) {
  const [order, setOrder] = useState<HomeTab[]>(props.order);
  const [pending, startTransition] = useTransition();
  const dirty = order.join() !== props.order.join();

  const move = (index: number, by: -1 | 1) => {
    setOrder((current) => {
      const next = [...current];
      const [tab] = next.splice(index, 1);
      next.splice(index + by, 0, tab);
      return next;
    });
  };

  const save = (order: HomeTab[]) =>
    startTransition(async () => {
      if (toastResult(await setHomeTabOrder({ order }))) setOrder(order);
    });

  return (
    <Section id="tab-order" title="Home tabs" description="The order everyone lands in; the first tab is the landing. People can still rearrange their own tabs — this sets the default.">
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
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => save([])}>
          Reset to built-in
        </Button>
        <Button type="button" size="sm" disabled={pending || !dirty} onClick={() => save(order)}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
