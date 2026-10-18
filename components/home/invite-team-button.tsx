import { UserPlus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// The primary action on Home for an admin who is still alone in the workspace: there is no team to track yet.

export function InviteTeamButton() {
  return (
    <Button asChild>
      <Link href="/settings/workspace">
        <UserPlus aria-hidden />
        Invite your team
      </Link>
    </Button>
  );
}
