"use client";

import { cn } from "cn";
import { FileUp, Lock, Paperclip, PictureInPicture2, Plus, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { attachDraft } from "@/actions/drafts";
import { CaptureFlow } from "@/components/capture/capture-flow";
import { CharacterCounter } from "@/components/character-counter";
import { TaskPickerDialog } from "@/components/tasks/task-picker-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CaptureContext, CaptureProvider } from "@/lib/capture/draft";
import { draftName, oneLine, UNTITLED_DRAFT, type DraftNote, type DraftSummary } from "@/lib/drafts";
import { LIMITS } from "@/lib/limits";
import { toastResult } from "@/lib/toast-result";
import { flushNotepad, hydrateNotepad, newDraft, noteDraftTask, notepadNow, openDraft, removeDraft, setNotepadBody, setNotepadMode, setNotepadTitle, useNotepad, type SaveState } from "./notepad-store";

// The Draft tab (docs/PLAN.md, 2026-11-04 and 2026-11-11 logs): the person's drafts as a list, and the one that is
// open beside it. A draft has a title of its own (left empty, the list names it by its first line) and saves
// itself as it is typed. It can be attached to one task, so the working notes travel with the work: the draft
// stays its author's alone, and the task's page shows it to them only. Upload a transcript or notes file and it
// lands in the open draft; "Turn into work" hands that draft's text to the capture helper, whose proposal appears
// underneath to edit, untick and create. The switch keeps a floating copy of the open draft on every page.

function saveLabel(save: SaveState, savedAt: string | null): string {
  if (save === "saving") return "Saving…";
  if (save === "dirty") return "Unsaved changes";
  if (save === "error") return "Couldn't save. Your text is still here; it will try again as you type.";
  if (savedAt) return `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return "Nothing saved yet";
}

const wordsIn = (text: string) => (text.trim() === "" ? 0 : text.trim().split(/\s+/).length);

/** "Nov 11": the day a draft last changed, in the reader's own calendar (drawn only once the browser has the list). */
const dayOf = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

const DRAFT_URL = "/home?view=draft";

/** One row of the list: what the draft is called, when it last changed and how it starts, and the task it is attached to. */
function DraftRow({ draft, selected, dated, onPick }: { draft: DraftSummary; selected: boolean; dated: boolean; onPick: () => void }) {
  const name = draftName(draft);
  // A draft named by its first line would say that line twice.
  const excerpt = draft.title.trim() === "" ? "" : oneLine(draft.excerpt);
  const detail = [dated ? dayOf(draft.updatedAt) : null, excerpt || (draft.excerpt === "" ? "Empty" : null)].filter((part) => part !== null).join(" · ");
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-current={selected ? "true" : undefined}
        data-draft-item={draft.id}
        className={cn(
          "grid w-full gap-0.5 rounded-md border-l-2 px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "border-primary bg-accent" : "border-transparent hover:bg-accent/60",
        )}
      >
        <span className={cn("truncate text-[14px] font-medium", name === UNTITLED_DRAFT && "text-muted-foreground")}>{name}</span>
        {detail ? <span className="truncate text-[13px] text-muted-foreground">{detail}</span> : null}
        {draft.task ? (
          <span className="mt-0.5 inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground" data-draft-item-task>
            <Paperclip className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{draft.task.title}</span>
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function DraftWorkspace({
  initial,
  requested,
  context,
  provider,
  canConvert,
}: {
  /** The drafts as the server has them, and the one it opened: the address's `draft`, else the one changed last. */
  initial: { drafts: DraftSummary[]; current: DraftNote | null };
  /** The draft the address asks for (a link from a task's page), when it is one of the person's. */
  requested: string | null;
  context: CaptureContext | null;
  provider: CaptureProvider | null;
  canConvert: boolean;
}) {
  const notepad = useNotepad();
  const fileInput = useRef<HTMLInputElement>(null);
  const bodyBox = useRef<HTMLTextAreaElement>(null);
  const [converting, setConverting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, startTransition] = useTransition();

  // The server's drafts seed the shared store; from then on the store is the truth (the floating notepad too).
  useEffect(() => {
    hydrateNotepad(initial.drafts, initial.current);
  }, [initial]);
  // A link to one draft (from a task's page) opens it, whatever was open before.
  useEffect(() => {
    if (requested) void openDraft(requested);
  }, [requested]);
  useEffect(() => {
    const flush = () => void flushNotepad();
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);
  // The address names the open draft, so a reload, a shared tab or Back comes back to it. Only the address
  // changes: nothing is asked of the server.
  const { loaded, currentId: openId } = notepad;
  useEffect(() => {
    if (!loaded || window.location.pathname !== "/home") return;
    const url = openId ? `${DRAFT_URL}&draft=${encodeURIComponent(openId)}` : DRAFT_URL;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(window.history.state, "", url);
  }, [loaded, openId]);

  const drafts = loaded ? notepad.drafts : initial.drafts;
  const currentId = loaded ? notepad.currentId : (initial.current?.id ?? null);
  const title = loaded ? notepad.title : (initial.current?.title ?? "");
  const body = loaded ? notepad.body : (initial.current?.body ?? "");
  const ready = loaded ? notepad.ready : true;
  const current = drafts.find((draft) => draft.id === currentId) ?? null;
  const task = current?.task ?? null;
  const words = wordsIn(body);
  const floating = notepad.mode !== "off";
  const name = draftName({ title, body });

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > LIMITS.draft * 4) {
      setFileError("That file is too large for one draft. Paste the part you want instead.");
      return;
    }
    const text = (await file.text()).trim();
    const joined = body.trim() === "" ? text : `${body.trimEnd()}\n\n${text}`;
    setNotepadBody(joined.slice(0, LIMITS.draft));
    setFileError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  /** Attaches the open draft to a task, or (with no task) lets go of it. What was typed is saved first, so the draft exists. */
  async function attach(taskId: string): Promise<boolean> {
    await flushNotepad();
    const id = notepadNow().currentId;
    if (id === null) return false;
    const result = await attachDraft({ id, taskId });
    if (!toastResult(result)) return false;
    noteDraftTask(id, result.data.task);
    return true;
  }

  const startNew = () =>
    startTransition(async () => {
      if (await newDraft()) bodyBox.current?.focus();
    });

  const confirmDelete = () =>
    startTransition(async () => {
      if (currentId === null) return;
      if (toastResult(await removeDraft(currentId))) setDeleting(false);
    });

  /** There is a draft to act on: one that is saved, or words that will make one. */
  const exists = currentId !== null;
  const attachable = exists || title.trim() !== "" || body.trim() !== "";

  return (
    <div className="grid gap-5">
      <div className="grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-xl border bg-card shadow-xs" aria-labelledby="draft-list-heading" data-draft-list>
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <h2 id="draft-list-heading" className="flex items-baseline gap-2 pl-1 text-base font-semibold">
              Your drafts
              <span className="text-[13px] font-normal text-muted-foreground tabular-nums" data-draft-count>
                {drafts.length}
              </span>
            </h2>
            <Button type="button" variant="outline" size="sm" onClick={startNew} disabled={pending} data-draft-new>
              <Plus aria-hidden />
              New draft
            </Button>
          </div>
          {drafts.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-muted-foreground">No drafts yet. Start typing: your first words make your first draft.</p>
          ) : (
            <ul className="grid max-h-56 gap-0.5 overflow-y-auto p-1.5 lg:max-h-[32rem]">
              {drafts.map((draft) => (
                <DraftRow key={draft.id} draft={draft} selected={draft.id === currentId} dated={loaded} onPick={() => void openDraft(draft.id)} />
              ))}
            </ul>
          )}
        </aside>

        <section className="min-w-0 rounded-xl border bg-card shadow-xs" aria-label={`Draft: ${name}`} data-draft-current={currentId ?? ""}>
          <div className="border-b px-4 pt-3 pb-2">
            <label htmlFor="draft-title" className="sr-only">
              Draft title
            </label>
            <input
              id="draft-title"
              value={title}
              onChange={(event) => setNotepadTitle(event.target.value.slice(0, LIMITS.draftTitle))}
              placeholder={body.trim() === "" ? UNTITLED_DRAFT : `${name} (add a title)`}
              maxLength={LIMITS.draftTitle}
              autoComplete="off"
              readOnly={!ready}
              className="w-full bg-transparent text-lg font-semibold tracking-tight outline-none placeholder:font-normal placeholder:text-muted-foreground md:text-xl"
            />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
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
          </div>

          {/* Where the draft belongs: the task it is attached to, or the way to attach it. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/30 px-4 py-2 text-[13px]" data-draft-task={task?.id ?? ""}>
            {task ? (
              <>
                <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <Paperclip className="size-3.5 shrink-0" aria-hidden />
                  <span className="shrink-0">Attached to</span>
                  <Link href={`/tasks/${task.id}`} className="min-w-0 truncate font-medium text-link underline-offset-4 hover:underline">
                    {task.title}
                  </Link>
                </span>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-muted-foreground" disabled={pending} onClick={() => setPicking(true)}>
                  Change…
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-muted-foreground" disabled={pending} onClick={() => startTransition(async () => void (await attach("")))} data-draft-detach>
                  <X aria-hidden />
                  Detach
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" size="sm" className="h-7" disabled={pending || !attachable} onClick={() => setPicking(true)} data-draft-attach>
                <Paperclip aria-hidden />
                Attach to a task…
              </Button>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground">
              <Lock className="size-3.5 shrink-0" aria-hidden />
              {task ? "Only you see it, here and on the task's page." : "Only you can see your drafts."}
            </span>
          </div>

          <Textarea
            ref={bodyBox}
            id="draft-body"
            value={body}
            onChange={(event) => setNotepadBody(event.target.value.slice(0, LIMITS.draft))}
            placeholder={ready ? "Jot anything: what came out of a call, ideas for next week, a to-do list…\n\nWhen it's ready, turn it into projects, goals and tasks below." : "Opening…"}
            rows={16}
            maxLength={LIMITS.draft}
            readOnly={!ready}
            aria-label="Your notes"
            className="min-h-[22rem] resize-y rounded-none border-0 bg-transparent px-4 py-3 text-base leading-relaxed shadow-none focus-visible:ring-0"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2">
            <p className="min-w-0 flex-1 text-[13px] text-destructive" aria-live="polite">
              {fileError ?? notepad.notice}
            </p>
            <CharacterCounter value={body} max={LIMITS.draft} />
            {exists ? (
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => setDeleting(true)} data-draft-delete>
                <Trash2 aria-hidden />
                Delete draft
              </Button>
            ) : null}
          </div>
        </section>
      </div>

      {canConvert ? (
        <section className="grid gap-3" data-draft-convert>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Turn it into work</h2>
              <p className="text-[13px] text-muted-foreground">
                {provider === null
                  ? "Needs ANTHROPIC_API_KEY on the server; until then, nothing leaves the server."
                  : "The helper proposes a project, goals and tasks from the open draft. You edit the proposal, untick what you don't want, then create the rest in one go."}
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
            <div className="rounded-xl border bg-card p-4">
              <CaptureFlow context={context} provider={provider} transcript={body} embedded onRestart={() => setConverting(false)} />
            </div>
          ) : null}
        </section>
      ) : (
        <p className="text-[13px] text-muted-foreground">A leader or admin can turn a draft into projects, goals and tasks from their own Draft tab; yours are kept here for you.</p>
      )}

      {picking ? (
        <TaskPickerDialog
          title={task ? "Attach to another task" : "Attach this draft to a task"}
          description={`“${name}” stays yours alone: on the task's page it is shown to you and nobody else.`}
          icon={<Paperclip className="size-4 text-muted-foreground" aria-hidden />}
          onPick={(picked) => attach(picked.id)}
          onClose={() => setPicking(false)}
        />
      ) : null}

      <Dialog open={deleting} onOpenChange={(open) => (pending ? undefined : setDeleting(open))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>
              &ldquo;{name}&rdquo; is removed for good{words > 0 ? `, all ${words} ${words === 1 ? "word" : "words"} of it` : ""}.
              {task ? ` It goes from “${task.title}” too; the task itself is not touched.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={pending} data-draft-delete-confirm>
              {pending ? "Deleting…" : "Delete draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
