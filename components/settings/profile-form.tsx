"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/actions/profile";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIMITS } from "@/lib/limits";
import { toastResult } from "@/lib/toast-result";
import { Section } from "./section";
import { TimezoneSelect } from "./timezone-select";

// Name and timezone. An empty timezone means "follow the workspace", so a move between workspaces in different
// zones needs no change here.

export function ProfileForm(props: { name: string; email: string; timezone: string; orgTimezone: string; zones: string[] }) {
  const [name, setName] = useState(props.name);
  const [timezone, setTimezone] = useState(props.timezone);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();
  const dirty = name !== props.name || timezone !== props.timezone;

  return (
    <Section id="profile" title="Profile" description="How you appear to your teammates.">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await updateProfile({ name, timezone });
            setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
            toastResult(result);
          });
        }}
      >
        <div className="grid gap-4 p-4 sm:p-5">
          <Field id="profile-email" label="Email" hint="You sign in with this address.">
            <Input id="profile-email" value={props.email} disabled readOnly />
          </Field>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field id="profile-name" label="Name" error={errors.name?.[0]} count={{ value: name, max: LIMITS.memberName }}>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={LIMITS.memberName}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "profile-name-error" : undefined}
              />
            </Field>
            <Field id="profile-timezone" label="Timezone" hint="Dates and times are shown in this zone." error={errors.timezone?.[0]}>
              <TimezoneSelect
                id="profile-timezone"
                zones={props.zones}
                emptyLabel={`Workspace default (${props.orgTimezone.replaceAll("_", " ")})`}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                aria-invalid={errors.timezone ? true : undefined}
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end border-t px-4 py-3 sm:px-5">
          <Button type="submit" disabled={pending || !dirty || name.trim() === ""}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Section>
  );
}
