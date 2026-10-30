"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { InviteForm } from "@/components/settings/invite-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OrgRole } from "@/lib/constants";

// "Invite people" on the Members page: the same form as Settings → Workspace, in a dialog.

export function InviteDialog({ roles, variant = "default" }: { roles: OrgRole[]; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <UserPlus aria-hidden />
        Invite people
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite people</DialogTitle>
            <DialogDescription>
              They get an email with a link that works for 7 days. Pending invitations and their links are under{" "}
              <Link href="/settings/workspace#invitations" className="text-link underline-offset-4 hover:underline">
                Settings → Workspace
              </Link>
              .
            </DialogDescription>
          </DialogHeader>
          <InviteForm roles={roles} onInvited={(links) => links.length > 0 && setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
