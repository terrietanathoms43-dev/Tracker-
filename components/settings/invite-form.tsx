"use client";

import { cn } from "cn";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { inviteMembers, type InviteLink } from "@/actions/invitations";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ORG_ROLE_DESCRIPTIONS, ORG_ROLE_LABELS, type OrgRole } from "@/lib/constants";
import { toastResult } from "@/lib/toast-result";

// Emails (commas or new lines) and one role for the whole batch. Used by Settings → Workspace and by the
// onboarding invite step; `roles` is what the viewer may hand out (leaders never see Admin).

export function InviteForm({
  roles,
  onInvited,
  size = "default",
  secondaryAction,
  className,
}: {
  roles: OrgRole[];
  /** Receives the links of the invitations just made, so they can be copied. */
  onInvited?: (links: InviteLink[]) => void;
  size?: "default" | "lg";
  /** e.g. onboarding's "Skip for now", shown beside the submit button. */
  secondaryAction?: ReactNode;
  className?: string;
}) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<OrgRole>(roles.includes("member") ? "member" : roles[0]);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const large = size === "lg";

  function submit() {
    startTransition(async () => {
      const result = await inviteMembers({ emails, role });
      if (!result.ok) {
        setError(result.fieldErrors?.emails?.[0] ?? result.error);
        return;
      }
      setError(undefined);
      const { invited, alreadyMembers, failed } = result.data;
      onInvited?.(invited);
      if (invited.length > 0) {
        toastResult(result);
        setEmails("");
      }
      if (alreadyMembers.length > 0) toast.info(`Already in the workspace: ${alreadyMembers.join(", ")}`);
      if (failed.length > 0) toast.error(`Couldn't email ${failed.join(", ")}. Copy the link instead.`);
    });
  }

  return (
    <form
      className={cn("grid gap-4", className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field id="invite-emails" label="Email addresses" hint="Separate several with commas or new lines." error={error}>
        <Textarea
          id="invite-emails"
          value={emails}
          onChange={(event) => setEmails(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && emails.trim() !== "") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="name@company.com, another@company.com"
          autoComplete="off"
          spellCheck={false}
          rows={2}
          className="min-h-16"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "invite-emails-error" : undefined}
        />
      </Field>
      <Field id="invite-role" label="Role" hint={ORG_ROLE_DESCRIPTIONS[role]}>
        <NativeSelect
          id="invite-role"
          className={cn("sm:max-w-56", large && "[&>select]:h-10")}
          value={role}
          onChange={(event) => setRole(event.target.value as OrgRole)}
        >
          {roles.map((each) => (
            <option key={each} value={each}>
              {ORG_ROLE_LABELS[each]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="submit" className={cn(large && "h-10 flex-1")} disabled={pending || emails.trim() === ""}>
          {pending ? "Sending…" : "Send invitations"}
        </Button>
        {secondaryAction}
      </div>
    </form>
  );
}
