"use client";

import { cn } from "cn";
import { FileUp, PictureInPicture2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CaptureFlow } from "@/components/capture/capture-flow";
import { CharacterCounter } from "@/components/character-counter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CaptureContext, CaptureProvider } from "@/lib/capture/draft";
import type { Draft } from "@/lib/dal/drafts";
import { LIMITS } from "@/lib/limits";
import { ensureNotepadLoaded, flushNotepad, hydrateNotepad, setNotepadBody, setNotepadMode, useNotepad, type SaveState } from "./notepad-store";

// The Draft tab (docs/PLAN.md, 2026-11-04 log): a notepad first, everything else second. Type, and it saves itself.
// Upload a transcript or notes file and it lands in the text. "Turn into work" hands the text to the capture helper,
// whose draft appears underneath to edit, untick and create. The switch keeps a floating copy of the notepad open
// on every page.

function saveLabel(save: SaveState, savedAt: string | null): string {
  if (save === "saving") return "Saving…";
  if (save === "dirty") return "Unsaved changes";
  if (save === "error") return "Couldn't save. Your text is still here; it will try again as you type.";
  if (savedAt) return `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return "Nothing saved yet";
}

const wordsIn = (text: string) => (text.trim() === "" ? 0 : text.trim().split(/\s+/).length);

export function DraftEditor({ initial, context, provider, canConvert }: { initial: Draft; context: CaptureContext | null; provider: CaptureProvider | null; canConvert: boolean }) {
  const notepad = useNotepad();
  const fileInput = useRef<HTMLInputElement>(null);
  const [converting, setConverting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // The server's text seeds the shared store once; from then on the store is the truth (the floating notepad too).
  useEffect(() => {
    hydrateNotepad(initial.body, initial.updatedAt);
  }, [initial.body, initial.updatedAt]);
  useEffect(() => {
    const flush = () => void flushNotepad();
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > LIMITS.draft * 4) {
      setFileError("That file is too large for one note. Paste the part you want instead.");
      return;
    }
    const text = (await file.text()).trim();
    const joined = notepad.body.trim() === "" ? text : `${notepad.body.trimEnd()}\n\n${text}`;
    setNotepadBody(joined.slice(0, LIMITS.draft));
    setFileError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  const body = notepad.loaded ? notepad.body : initial.body;
  const words = wordsIn(body);
  const floating = notepad.mode !== "off";

  return (
    <div className="grid gap-5">
      <section className="rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2.5">
          <p className="text-[13px] text-muted-foreground" aria-live="polite" data-draft-save data-save-state={notepad.save}>
            {saveLabel(notepad.save, notepad.savedAt)}
            {words > 0 ? ` · ${words} ${words === 1 ? "word" : "words"}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => fileInput.current?.click()}>
              <FileUp aria-hidden />
              Upload notes or a transcript
            </Button>
            <input ref={fileInput} type="file" accept=".vtt,.srt,.txt,.md,text/plain,text/vtt" className="sr-only" aria-label="Upload a notes or transcript file" onChange={(event) => void readFile(event.target.files?.[0])} />
            <div className="flex items-center gap-2 pl-1">
              <Switch id="notepad-floating" checked={floating} onCheckedChange={(on) => setNotepadMode(on ? "open" : "off")} />
              <Label htmlFor="notepad-floating" className="inline-flex items-center gap-1.5 text-[13px] font-normal text-muted-foreground">
                <PictureInPicture2 className="size-3.5" aria-hidden />
                Keep the notepad open while you browse
              </Label>
            </div>
          </div>
        </div>
        <Textarea
          id="draft-body"
          value={body}
          onChange={(event) => setNotepadBody(event.target.value.slice(0, LIMITS.draft))}
          onFocus={() => void ensureNotepadLoaded()}
          placeholder={"Jot anything: what came out of a call, ideas for next week, a to-do list…\n\nWhen it's ready, turn it into projects, goals and tasks below."}
          rows={16}
          maxLength={LIMITS.draft}
          aria-label="Your notes"
          className="min-h-[22rem] resize-y rounded-none border-0 bg-transparent px-4 py-3 text-base leading-relaxed shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-3 border-t px-4 py-2">
          <p className="text-[13px] text-destructive">{fileError}</p>
          <CharacterCounter value={body} max={LIMITS.draft} />
        </div>
      </section>

      {canConvert ? (
        <section className="grid gap-3" data-draft-convert>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Turn it into work</h2>
              <p className="text-[13px] text-muted-foreground">
                {provider === null
                  ? "Needs ANTHROPIC_API_KEY on the server; until then, nothing leaves the server."
                  : "The helper proposes a project, goals and tasks from your notes. You edit the draft, untick what you don't want, then create the rest in one go."}
              </p>
            </div>
            {!converting ? (
              <Button type="button" disabled={provider === null || body.trim().length < 20} onClick={() => setConverting(true)}>
                <Sparkles aria-hidden />
                Turn into work
              </Button>
            ) : null}
          </div>
          {converting && context && provider ? (
            <div className={cn("rounded-xl border bg-card p-4")}>
              <CaptureFlow context={context} provider={provider} transcript={body} embedded onRestart={() => setConverting(false)} />
            </div>
          ) : null}
        </section>
      ) : (
        <p className="text-[13px] text-muted-foreground">A leader or admin can turn notes into projects, goals and tasks from their own Draft tab; yours are kept here for you.</p>
      )}
    </div>
  );
}
