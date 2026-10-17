"use client";

import { CheckCheck } from "lucide-react";
import { useTransition } from "react";
import { markAllNotificationsRead } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { toastResult } from "@/lib/toast-result";

/** Clears every unread dot in the active workspace (the action refresh()es the list and the shell's count). */
export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => void toastResult(await markAllNotificationsRead()))}>
      <CheckCheck aria-hidden />
      {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}
