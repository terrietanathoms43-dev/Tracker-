"use client";

import { useState, useTransition } from "react";
import { updatePreferences } from "@/actions/profile";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Preferences } from "@/lib/dal/notifications";
import { toastResult } from "@/lib/toast-result";
import { Section } from "./section";

// Which events also send an email. Each switch saves the moment it is flipped (optimistically, put back if
// the save fails), so there is no Save button to forget.

const OPTIONS: { key: keyof Preferences; label: string; hint: string }[] = [
  { key: "emailAssignment", label: "A task is assigned to me", hint: "When someone creates a task for you or assigns one to you." },
  { key: "emailHandover", label: "Work is handed over to me", hint: "When a teammate passes a task to you with their notes." },
  { key: "emailApproval", label: "Approvals", hint: "When you're asked to approve a task, and when yours is approved or sent back." },
  { key: "emailBlocked", label: "A task is blocked", hint: "Leaders and admins: when a task in the workspace is marked blocked." },
  { key: "emailRequestDecision", label: "A decision on my request", hint: "When a request you submitted is approved, deferred, rejected or turned into a task." },
  { key: "emailComment", label: "Comments on my tasks", hint: "When someone comments on a task you're assigned to or created." },
];

export function NotificationPreferences({ initial, email }: { initial: Preferences; email: string }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState<keyof Preferences | null>(null);
  const [, startTransition] = useTransition();

  function toggle(key: keyof Preferences, checked: boolean) {
    setValues((current) => ({ ...current, [key]: checked }));
    setSaving(key);
    startTransition(async () => {
      const result = await updatePreferences({ [key]: checked });
      if (!toastResult(result)) setValues((current) => ({ ...current, [key]: !checked }));
      setSaving(null);
    });
  }

  return (
    <Section
      id="email-notifications"
      title="Email notifications"
      description={`Sent to ${email}. Everything also shows under Notifications, whatever you choose here.`}
    >
      <ul className="divide-y">
        {OPTIONS.map(({ key, label, hint }) => (
          <li key={key} className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <Label htmlFor={`pref-${key}`} className="text-sm font-medium">
                {label}
              </Label>
              <p id={`pref-${key}-hint`} className="mt-0.5 text-[13px] text-muted-foreground">
                {hint}
              </p>
            </div>
            <Switch
              id={`pref-${key}`}
              className="mt-0.5"
              checked={values[key]}
              disabled={saving === key}
              aria-describedby={`pref-${key}-hint`}
              onCheckedChange={(checked) => toggle(key, checked)}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}
