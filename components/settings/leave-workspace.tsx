"use client";

import { useTransition } from "react";
import { leaveWorkspace } from "@/actions/members";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toastResult } from "@/lib/toast-result";
import { Section } from "./section";

// The last card on the Profile tab. The only admin is told what to do instead of being offered a button the
// server would refuse.

export function LeaveWorkspace({ orgName, soleAdmin }: { orgName: string; soleAdmin: boolean }) {
  const [pending, startTransition] = useTransition();

  if (soleAdmin) {
    return (
      <Section
        id="leave"
        title="Leave workspace"
        description={`You're the only admin of ${orgName}. Make someone else an admin under Workspace first, or delete the workspace there.`}
      />
    );
  }

  return (
    <Section
      id="leave"
      title="Leave workspace"
      description={`You'll lose access to ${orgName} straight away. Your open tasks become unassigned; your updates and history stay.`}
      action={
        <ConfirmDialog
          title={`Leave ${orgName}?`}
          description="You'll need a new invitation to come back. Your open tasks become unassigned so the team can pick them up."
          confirmLabel="Leave workspace"
          pending={pending}
          onConfirm={() =>
            new Promise<boolean>((resolve) =>
              // On success the action redirects to /home, which picks another workspace or onboarding.
              startTransition(async () => resolve(toastResult(await leaveWorkspace()))),
            )
          }
          trigger={<Button variant="outline">Leave workspace</Button>}
        />
      }
    />
  );
}
