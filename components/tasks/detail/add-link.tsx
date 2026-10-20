"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { addLink } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastResult } from "@/lib/toast-result";

// Adding an evidence link on the task page without writing an update.

/** "Add link": evidence without writing an update (a commit, a ticket, a document). */
export function AddLink({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[13px] text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Add link
      </Button>
    );
  }
  const close = () => {
    setOpen(false);
    setUrl("");
    setLabel("");
    setError(null);
  };
  return (
    <form
      className="grid w-full gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await addLink({ taskId, url: url.trim(), label });
          if (!result.ok) return setError(result.fieldErrors?.url?.[0] ?? result.error);
          toastResult(result);
          close();
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <div className="grid gap-1">
        <Input aria-label="Evidence link" placeholder="https://…" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} autoFocus aria-invalid={error ? true : undefined} />
        {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      </div>
      <Input aria-label="Evidence label" placeholder="Label (optional)" value={label} onChange={(event) => setLabel(event.target.value)} />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || url.trim() === ""}>
          {pending ? "Adding…" : "Add link"}
        </Button>
      </div>
    </form>
  );
}
