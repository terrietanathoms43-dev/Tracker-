"use client";

import { useState, useTransition } from "react";
import { deleteOrganization } from "@/actions/org";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LIMITS } from "@/lib/limits";
import { Section } from "./section";

// The one irreversible action in settings. Typing the workspace's name is the confirmation, so a stray click
// can never delete everyone's work; the server checks the name again.

export function DeleteWorkspace({ orgName }: { orgName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const matches = typed.trim() === orgName;

  return (
    <Section
      id="delete-workspace"
      tone="danger"
      title="Delete workspace"
      description="Deletes every task, project, goal, request and member of this workspace. This can't be undone."
      action={
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setTyped("");
              setError(undefined);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" className="text-destructive hover:text-destructive">
              Delete workspace
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  // On success the action redirects to /home (another workspace, or onboarding).
                  const result = await deleteOrganization({ confirmName: typed });
                  if (result && !result.ok) setError(result.fieldErrors?.confirmName?.[0] ?? result.error);
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>Delete {orgName}?</DialogTitle>
                <DialogDescription>Everything in it is deleted for everyone, straight away. Type the workspace name to confirm.</DialogDescription>
              </DialogHeader>
              <Field id="delete-confirm" label={`Type “${orgName}”`} error={error}>
                <Input
                  id="delete-confirm"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={LIMITS.workspaceName}
                  autoFocus
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "delete-confirm-error" : undefined}
                />
              </Field>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={!matches || pending}>
                  {pending ? "Deleting…" : "Delete workspace"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    />
  );
}
