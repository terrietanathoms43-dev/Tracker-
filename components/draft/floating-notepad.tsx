"use client";

import { cn } from "cn";
import { ChevronLeft, ChevronRight, NotebookPen, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/lib/limits";
import { ensureNotepadLoaded, flushNotepad, setNotepadBody, setNotepadMode, useNotepad } from "./notepad-store";

// The floating notepad (docs/PLAN.md, 2026-11-04 log): the same note as the Draft tab, in a small panel that
// stays on top of every page once switched on there. Fold it to a tab on the right edge; open it again from the
// tab; the × puts it away until the Draft tab switches it back on.

export function FloatingNotepad() {
  const notepad = useNotepad();
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

  return (
    <section
      aria-label="Notepad"
      data-notepad="open"
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden rounded-xl border bg-card shadow-xl",
        "inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] h-64 md:inset-x-auto md:right-5 md:bottom-5 md:h-80 md:w-80",
      )}
    >
      <header className="flex items-center gap-1 border-b px-2 py-1.5">
        <NotebookPen className="ml-1 size-4 text-primary" aria-hidden />
        <span className="text-sm font-semibold">Notes</span>
        <span className="ml-1 text-[12px] text-muted-foreground" aria-live="polite">
          {notepad.save === "saving" ? "Saving…" : notepad.save === "dirty" ? "Unsaved" : notepad.save === "error" ? "Not saved" : notepad.save === "saved" ? "Saved" : ""}
        </span>
        <Link href="/home?view=draft" className="ml-auto text-[12px] font-medium text-link underline-offset-4 hover:underline">
          Draft tab
        </Link>
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
        value={notepad.body}
        onChange={(event) => setNotepadBody(event.target.value.slice(0, LIMITS.draft))}
        placeholder={notepad.loaded ? "Jot anything…" : "Loading your notes…"}
        maxLength={LIMITS.draft}
        aria-label="Your notes"
        data-notepad-body
        className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-2 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
      />
    </section>
  );
}
