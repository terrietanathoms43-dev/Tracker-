"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { submitRequest } from "@/actions/requests";
import { Field } from "@/components/field";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { REQUEST_URGENCIES, REQUEST_URGENCY_LABELS, type RequestUrgency } from "@/lib/constants";

// The New request button and its dialog: anyone in the workspace, stakeholders included, can ask for something.

type Errors = Record<string, string[] | undefined>;

/** The form inside the dialog. Mounted per opening, so a closed dialog forgets what was typed. */
function NewRequestForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<RequestUrgency>("normal");
  const [link, setLink] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const error = (key: string) => errors[key]?.[0];

  function submit() {
    if (pending || title.trim() === "") return;
    startTransition(async () => {
      const result = await submitRequest({ title, desiredOutcome, description, urgency, link: link.trim() });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      const id = result.data.id;
      toast.success(result.message ?? "Request sent.", { action: { label: "Open", onClick: () => router.push(`/requests/${id}`) } });
      onDone();
    });
  }

  return (
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
      <Field id="request-title" label="What do you need?" error={error("title")}>
        <Input
          id="request-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Export invoices as CSV for finance"
          maxLength={200}
          autoFocus
          aria-invalid={error("title") ? true : undefined}
        />
      </Field>
      <Field id="request-outcome" label="Why does it matter?" hint="The business reason, and what should be true once it's done." error={error("desiredOutcome")}>
        <Textarea
          id="request-outcome"
          value={desiredOutcome}
          onChange={(event) => setDesiredOutcome(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="e.g. Month-end close takes two days of copying by hand."
        />
      </Field>
      <Field id="request-description" label="Details" hint="Optional." error={error("description")}>
        <Textarea id="request-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={10_000} />
      </Field>
      <div className="grid gap-2">
        <span className="text-base leading-none font-medium">Urgency</span>
        <Segmented className="w-fit" label="Urgency" value={urgency} onChange={setUrgency} options={REQUEST_URGENCIES.map((value) => ({ value, label: REQUEST_URGENCY_LABELS[value] }))} />
      </div>
      <Field id="request-link" label="Supporting link" hint="Optional: a ticket, a document, a screenshot." error={error("link")}>
        <Input
          id="request-link"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://…"
          inputMode="url"
          aria-invalid={error("link") ? true : undefined}
        />
      </Field>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || title.trim() === ""}>
          {pending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}

/** "New request": the button and the dialog it opens. `variant="outline"` when it isn't the page's primary action. */
export function NewRequestDialog({ variant = "default" }: { variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        New request
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New request</DialogTitle>
            <DialogDescription>A leader decides on it and you&apos;ll hear why. Nothing is committed until then.</DialogDescription>
          </DialogHeader>
          {open ? <NewRequestForm onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
