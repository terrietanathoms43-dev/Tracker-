"use client";

import { useState, useTransition } from "react";
import { updateOrganization } from "@/actions/org";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastResult } from "@/lib/toast-result";
import { Section } from "./section";
import { TimezoneSelect } from "./timezone-select";

// Admins: the workspace's name and timezone. The timezone decides what "today" and "overdue" mean for
// everyone who hasn't picked their own.

export function WorkspaceForm(props: { name: string; timezone: string; zones: string[]; facts: string }) {
  const [name, setName] = useState(props.name);
  const [timezone, setTimezone] = useState(props.timezone);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();
  const dirty = name !== props.name || timezone !== props.timezone;

  return (
    <Section id="workspace" title="Workspace" description={props.facts}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await updateOrganization({ name, timezone });
            setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
            toastResult(result);
          });
        }}
      >
        <div className="grid items-start gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field id="workspace-name" label="Name" error={errors.name?.[0]}>
            <Input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoComplete="organization"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "workspace-name-error" : undefined}
            />
          </Field>
          <Field id="workspace-timezone" label="Timezone" hint="Sets what today and overdue mean." error={errors.timezone?.[0]}>
            <TimezoneSelect
              id="workspace-timezone"
              zones={props.zones}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              aria-invalid={errors.timezone ? true : undefined}
            />
          </Field>
        </div>
        <div className="flex justify-end border-t px-4 py-3 sm:px-5">
          <Button type="submit" disabled={pending || !dirty || name.trim().length < 2}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

/** Everyone else sees the same facts without the form. */
export function WorkspaceSummary({ name, facts }: { name: string; facts: string }) {
  return <Section id="workspace" title={name} description={facts} />;
}
