"use client";

import { cn } from "cn";
import { ChevronLeft, ChevronRight, NotebookPen, Paperclip, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { draftName } from "@/lib/drafts";
import { LIMITS } from "@/lib/limits";
import { ensureNotepadLoaded, flushNotepad, newDraft, openDraft, setNotepadBody, setNotepadMode, useNotepad } from "./notepad-store";

// The floating notepad (docs/PLAN.md, 2026-11-04 and 2026-11-11 logs): the draft that is open on the Draft tab, in
// a small panel that stays on top of every page once switched on there. Its header picks another draft or starts
// a new one; the line under the text says whether it is saved and which task it is attached to. Fold it to a tab
// on the right edge; open it again from the tab; the × puts it away until the Draft tab switches it back on.

export function FloatingNotepad() {
  const notepad = useNotepad();
  const box = useRef<HTMLTextAreaElement>(null);
  const shown = notepad.mode !== "off";
  useEffect(() => {
    if (shown) void ensureNotepadLoaded();
  }, [shown]);
  if (!shown) return null;

  if (notepad.mode === "collapsed") {
    return (
      <button
        type="button"
        onClick={() => setNotepadMode("open")}
        aria-label="Open the notepad"
        data-notepad="collapsed"
        className="fixed top-1/2 right-0 z-40 flex -translate-y-1/2 items-center gap-1.5 rounded-l-lg border border-r-0 bg-card px-2 py-3 text-[13px] font-medium shadow-md transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [writing-mode:vertical-rl]"
      >
        <NotebookPen className="size-4 rotate-90" aria-hidden />
        Notes
        <ChevronLeft className="size-3.5 rotate-90" aria-hidden />
      </button>
    );
  }

  const current = notepad.drafts.find((draft) => draft.id === notepad.currentId) ?? null;
  const saved = notepad.save === "saving" ? "Saving…" : notepad.save === "dirty" ? "Unsaved" : notepad.save === "error" ? "Not saved" : notepad.save === "saved" ? "Saved" : "";
  const writable = notepad.loaded && notepad.ready;

  return (
    <section
      aria-label="Notepad"
      data-notepad="open"
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden rounded-xl border bg-card shadow-xl",
        "inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] h-72 md:inset-x-auto md:right-5 md:bottom-5 md:h-88 md:w-80",
      )}
    >
      <header className="flex items-center gap-1 border-b px-2 py-1.5">
        <NotebookPen className="ml-1 size-4 shrink-0 text-primary" aria-hidden />
        {/* Which draft: the list from the Draft tab, in a control small enough for the panel. */}
        <select
          aria-label="Draft"
          data-notepad-draft
          value={notepad.currentId ?? ""}
          disabled={!notepad.loaded || notepad.drafts.length === 0}
          onChange={(event) => void openDraft(event.target.value)}
          className="h-7 min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold outline-none hover:border-input focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-100 dark:bg-card dark:scheme-dark"
        >
          {notepad.currentId === null ? <option value="">{notepad.loaded ? "New draft" : "Notes"}</option> : null}
          {notepad.drafts.map((draft) => (
            <option key={draft.id} value={draft.id}>
              {draftName(draft)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="New draft"
          disabled={!notepad.loaded}
          onClick={() =>
            void newDraft().then((made) => {
              if (made) box.current?.focus();
            })
          }
        >
          <Plus aria-hidden />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Fold the notepad to the edge" onClick={() => setNotepadMode("collapsed")}>
          <ChevronRight aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Put the notepad away"
          onClick={() => {
            void flushNotepad();
            setNotepadMode("off");
          }}
        >
          <X aria-hidden />
        </Button>
      </header>
      <Textarea
        ref={box}
        value={notepad.body}
        onChange={(event) => setNotepadBody(event.target.value.slice(0, LIMITS.draft))}
        placeholder={!notepad.loaded ? "Loading your drafts…" : notepad.ready ? "Jot anything…" : "Opening…"}
        maxLength={LIMITS.draft}
        readOnly={!writable}
        aria-label="Your notes"
        data-notepad-body
        className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-2 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
      />
      <footer className="flex items-center gap-2 border-t px-3 py-1.5 text-[12px] text-muted-foreground">
        <span className="shrink-0" aria-live="polite">
          {notepad.notice ? <span className="text-destructive">Not saved</span> : saved}
        </span>
        {current?.task ? (
          <Link href={`/tasks/${current.task.id}`} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground" title={`Attached to ${current.task.title}`} data-notepad-task>
            <Paperclip className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{current.task.title}</span>
          </Link>
        ) : null}
        <Link href={notepad.currentId ? `/home?view=draft&draft=${notepad.currentId}` : "/home?view=draft"} className="ml-auto shrink-0 font-medium text-link underline-offset-4 hover:underline">
          Draft tab
        </Link>
      </footer>
    </section>
  );
}
