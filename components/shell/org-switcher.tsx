"use client";

import { cn } from "cn";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { switchOrganization } from "@/actions/org";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type OrgOption = { orgId: string; name: string };

function OrgTile({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground", className)}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** The active workspace, and a menu to switch to another one or create one. Without any workspace it offers to create the first. */
export function OrgSwitcher({ orgs, activeOrgId, compact = false }: { orgs: OrgOption[]; activeOrgId: string | null; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const active = orgs.find((org) => org.orgId === activeOrgId) ?? orgs[0] ?? { orgId: "", name: "No workspace" };

  function choose(orgId: string) {
    if (orgId === activeOrgId) return;
    startTransition(async () => {
      const result = await switchOrganization({ orgId });
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-md text-left font-medium outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "h-9 max-w-[60vw] px-1.5 text-base" : "h-10 w-full px-2 text-base",
        )}
      >
        <OrgTile name={active.orgId === "" ? "?" : active.name} />
        <span className="truncate">{active.name}</span>
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">Switch workspace</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-[13px] font-normal text-muted-foreground">Workspaces</DropdownMenuLabel>
        {orgs.length === 0 ? <DropdownMenuItem disabled>You&apos;re not in a workspace yet</DropdownMenuItem> : null}
        {orgs.map((org) => (
          <DropdownMenuItem key={org.orgId} onSelect={() => choose(org.orgId)} className="gap-2">
            <OrgTile name={org.name} className="size-5 text-[11px]" />
            <span className="truncate">{org.name}</span>
            {org.orgId === activeOrgId ? <Check className="ml-auto size-4" aria-label="Current" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2">
          <Link href="/onboarding?new=1">
            <Plus className="size-4" aria-hidden />
            New workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
