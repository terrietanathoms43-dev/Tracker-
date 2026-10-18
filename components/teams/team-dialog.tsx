"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTeam, updateTeam } from "@/actions/teams";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import type { ActionResult } from "@/lib/action-result";
import { nameOf } from "@/lib/tasks/people";
import type { Person } from "@/lib/tasks/types";

// New team and Edit team: one dialog, one form. Leaders and admins only; the page decides whether to render it.

type Errors = Record<string, string[] | undefined>;

/** The team being edited, as the Members or team page has it. */
export type EditableTeam = { id: string; name: string; description: string | null; memberIds: string[] };

/** Members are picked from a checklist of the workspace's workers; a search box appears once the list is long. */
const SEARCH_FROM = 8;

/**
 * Renders its own trigger ("New team", or "Edit team" for an existing one) and the dialog behind it. Only the
 * name is required. Ctrl/⌘+Enter submits; the action's field errors show under each field.
 */
export function TeamDialog({ team, people, variant = "default", size = "default" }: { team?: EditableTeam; people: Person[]; variant?: "default" | "outline"; size?: "default" | "sm" }) {
  const router = useRouter();
  const editing = team !== undefined;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();

  function show() {
    // Start from the team as it is now: someone may have changed it since the page first rendered.
    setName(team?.name ?? "");
    setDescription(team?.description ?? "");
    setMemberIds(team?.memberIds ?? []);
    setSearch("");
    setErrors({});
    setOpen(true);
  }

  const toggle = (userId: string) => setMemberIds((current) => (current.includes(userId) ? current.filter((each) => each !== userId) : [...current, userId]));
  const shown = search.trim() === "" ? people : people.filter((person) => `${nameOf(person)} ${person.email ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  function submit() {
    if (pending || name.trim() === "") return;
    startTransition(async () => {
      const result: ActionResult<{ id: string } | undefined> = editing
        ? await updateTeam({ teamId: team.id, name, description, memberIds })
        : await createTeam({ name, description, memberIds });
      if (!result.ok) {
        const fields = result.fieldErrors ?? {};
        if (Object.keys(fields).length > 0) setErrors(fields);
        else toast.error(result.error);
        return;
      }
      setOpen(false);
      const created = result.data;
      if (created) toast.success(result.message ?? "Team created.", { action: { label: "Open", onClick: () => router.push(`/teams/${created.id}`) } });
      else toast.success(result.message ?? "Team saved.");
    });
  }

  return (
    <>
      {editing ? (
        <Button variant="outline" size={size} onClick={show}>
          <Pencil aria-hidden />
          Edit team
        </Button>
      ) : (
        <Button variant={variant} size={size} onClick={show}>
          <Plus aria-hidden />
          New team
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit team" : "New team"}</DialogTitle>
            <DialogDescription>A team is a group of members that work can be assigned to. Everyone in it sees the team&apos;s tasks in My Work.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
          >
            <Field id="team-name" label="Name" error={errors.name?.[0]}>
              <Input id="team-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Frontend" maxLength={60} autoFocus aria-invalid={errors.name ? true : undefined} />
            </Field>
            <Field id="team-description" label="What it looks after" hint="Optional." error={errors.description?.[0]}>
              <Textarea id="team-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={500} />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="text-sm leading-none font-medium">
                Members <span className="font-normal text-muted-foreground">({memberIds.length})</span>
              </legend>
              {people.length >= SEARCH_FROM ? (
                <Input aria-label="Search members" placeholder="Search members…" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1" />
              ) : null}
              {people.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody else does work in this workspace yet. Invite people first.</p>
              ) : (
                <ul className="mt-1 max-h-64 divide-y overflow-y-auto rounded-md border">
                  {shown.map((person) => {
                    const checked = memberIds.includes(person.id);
                    const id = `team-member-${person.id}`;
                    return (
                      <li key={person.id}>
                        <Label htmlFor={id} className="flex h-11 cursor-pointer items-center gap-3 px-3 font-normal hover:bg-accent/60">
                          <Checkbox id={id} checked={checked} onCheckedChange={() => toggle(person.id)} aria-label={`${checked ? "Remove" : "Add"} ${nameOf(person)}`} />
                          <UserAvatar name={person.name} email={person.email} image={person.image} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-[13px]">{nameOf(person)}</span>
                        </Label>
                      </li>
                    );
                  })}
                  {shown.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">Nobody matches.</li> : null}
                </ul>
              )}
              {errors.memberIds?.[0] ? <p className="text-xs text-destructive">{errors.memberIds[0]}</p> : null}
            </fieldset>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || name.trim() === ""}>
                {pending ? (editing ? "Saving…" : "Creating…") : editing ? "Save team" : "Create team"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
