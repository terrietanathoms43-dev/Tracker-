"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createOrganization } from "@/actions/org";
import { Field } from "@/components/field";
import { InviteForm } from "@/components/settings/invite-form";
import { TimezoneSelect } from "@/components/settings/timezone-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrgRole } from "@/lib/constants";
import { LIMITS } from "@/lib/limits";

// The two onboarding forms. Neither keeps "which step am I on": each action changes what exists on the server
// (a workspace, an invitation) and the page works the next step out from that.

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1.5 text-base text-muted-foreground">{text}</p>
    </div>
  );
}

/** first: no workspace yet · another: "New workspace" from the switcher (`?new=1`). */
export function WorkspaceStep({ zones, defaultTimezone, mode }: { zones: string[]; defaultTimezone: string; mode: "first" | "another" }) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          // On success the action redirects back to /onboarding, which then shows the invite step.
          const result = await createOrganization({ name, timezone });
          if (result && !result.ok) setErrors(result.fieldErrors ?? { name: [result.error] });
        });
      }}
    >
      <Heading
        title={mode === "first" ? "Create your workspace" : "Create another workspace"}
        text={
          mode === "first"
            ? "A workspace holds your team's tasks, goals and requests. You'll invite people next. Joining a team that already has one? Skip this and wait for their invitation."
            : "A workspace holds your team's tasks, goals and requests. You'll invite people next."
        }
      />
      <Field id="workspace-name" label="Workspace name" hint="Your company or team, e.g. Apex Engineering." error={errors.name?.[0]} count={{ value: name, max: LIMITS.workspaceName }}>
        <Input
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your company or team"
          maxLength={LIMITS.workspaceName}
          autoFocus
          autoComplete="organization"
          className="h-10"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "workspace-name-error" : undefined}
        />
      </Field>
      <Field id="workspace-timezone" label="Timezone" hint="Decides what today and overdue mean. You can change it later." error={errors.timezone?.[0]}>
        <TimezoneSelect
          id="workspace-timezone"
          zones={zones}
          className="[&>select]:h-10"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          aria-invalid={errors.timezone ? true : undefined}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-10 flex-1" disabled={pending || name.trim().length < 2}>
          {pending ? "Creating…" : "Create workspace"}
        </Button>
        {mode === "first" ? (
          <Button asChild variant="ghost" className="h-10">
            <Link href="/home">Skip for now</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Shown while the admin is still alone in the workspace. Sending moves the page on to "You're set up". */
export function InviteStep({ orgName, roles }: { orgName: string; roles: OrgRole[] }) {
  return (
    <div>
      <Heading title="Invite your colleagues" text={`They'll get an email with a link to join ${orgName}. You can skip this and invite people later.`} />
      <InviteForm
        roles={roles}
        size="lg"
        secondaryAction={
          <Button asChild variant="ghost" className="h-10">
            <Link href="/onboarding?step=done">Skip for now</Link>
          </Button>
        }
      />
    </div>
  );
}
