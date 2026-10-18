"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// "Show achieved" on Goals, "Show completed and archived" on Projects: a switch whose state lives in the address.

/**
 * Flips `?all=1` on `path` so the view can be shared and the back button works (apex-ux §6). The page reads the
 * parameter on the server; this only navigates.
 */
export function ShowAllToggle({ path, checked, label }: { path: string; checked: boolean; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex h-9 items-center gap-2 px-1" aria-busy={pending || undefined}>
      <Switch
        id="show-all"
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) => startTransition(() => router.replace(next ? `${path}?all=1` : path, { scroll: false }))}
      />
      <Label htmlFor="show-all" className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
    </div>
  );
}
