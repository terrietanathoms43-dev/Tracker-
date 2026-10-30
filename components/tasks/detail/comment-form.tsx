"use client";

import { useState, useTransition } from "react";
import { addComment } from "@/actions/tasks";
import { CharacterCounter } from "@/components/character-counter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/lib/limits";
import { toastResult } from "@/lib/toast-result";

// The inline Add a comment box above a task's history.

/** "Add a comment": a question or a note for the people on the task, without changing where it stands. */
export function CommentForm({ taskId }: { taskId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addComment({ taskId, body });
      if (!result.ok) return setError(result.fieldErrors?.body?.[0] ?? result.error);
      toastResult(result);
      setBody("");
      setError(null);
    });
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        aria-label="Add a comment"
        placeholder="Add a comment…"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={2}
        maxLength={LIMITS.comment}
        aria-invalid={error ? true : undefined}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex items-start justify-between gap-3">
        {error ? <p className="text-[13px] text-destructive">{error}</p> : <span />}
        <CharacterCounter value={body} max={LIMITS.comment} />
      </div>
      {body.trim() !== "" ? (
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? "Posting…" : "Comment"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
