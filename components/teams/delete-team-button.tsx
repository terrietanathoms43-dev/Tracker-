"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteTeam } from "@/actions/teams";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toastResult } from "@/lib/toast-result";

// Deleting a team, behind one confirmation that names it (apex-ux §4).

export function DeleteTeamButton({ teamId, name, openTasks }: { teamId: string; name: string; openTasks: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      title={`Delete the team ${name}?`}
      description={
        openTasks > 0
          ? `Its ${openTasks} open ${openTasks === 1 ? "task stays" : "tasks stay"} with the people assigned directly; the team comes off them and off its goals. History keeps the name.`
          : "It comes off its goals. History keeps the name. Nobody loses access to anything."
      }
      confirmLabel="Delete team"
      pending={pending}
      onConfirm={() =>
        new Promise<boolean>((resolve) =>
          startTransition(async () => {
            const ok = toastResult(await deleteTeam({ teamId }));
            if (ok) {
              // Leave the (now deleted) team's page first; Members then reloads without it.
              router.push("/members");
              router.refresh();
            }
            resolve(ok);
          }),
        )
      }
      trigger={
        <Button variant="ghost" className="text-muted-foreground">
          <Trash2 aria-hidden />
          Delete
        </Button>
      }
    />
  );
}
