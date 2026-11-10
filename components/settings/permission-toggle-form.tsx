"use client";

import { useState, useTransition } from "react";
import { setPermissionToggles } from "@/actions/config";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PERMISSION_TOGGLES, type PermissionToggle } from "@/lib/permissions";
import { toastResult } from "@/lib/toast-result";

// The workspace's permission switches (PERMISSION_TOGGLES). Each saves the moment it is flipped, like the
// email preferences above.

export function PermissionToggleForm({ initial }: { initial: Record<PermissionToggle, boolean> }) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle(key: PermissionToggle, checked: boolean) {
    const next = { ...values, [key]: checked };
    setValues(next);
    startTransition(async () => {
      if (!toastResult(await setPermissionToggles(next))) setValues(values);
    });
  }

  return (
    <ul className="divide-y">
      {(Object.keys(PERMISSION_TOGGLES) as PermissionToggle[]).map((key) => (
        <li key={key} className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <Label htmlFor={`toggle-${key}`} className="text-sm font-medium">
              {PERMISSION_TOGGLES[key].label}
            </Label>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{PERMISSION_TOGGLES[key].description}</p>
          </div>
          <Switch id={`toggle-${key}`} checked={values[key]} onCheckedChange={(checked) => toggle(key, checked)} disabled={pending} />
        </li>
      ))}
    </ul>
  );
}
