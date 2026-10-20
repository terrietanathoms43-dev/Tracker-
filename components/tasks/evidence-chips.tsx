"use client";

import { ExternalLink, X } from "lucide-react";
import { useTransition } from "react";
import { removeLink } from "@/actions/tasks";
import type { EvidenceLink } from "@/lib/tasks/types";
import { toastResult } from "@/lib/toast-result";

// Evidence links on the Resume card as chips, with a remove button for those allowed.

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Evidence as compact chips that open in a new tab. Links listed in `removable` (decided on the server: people who
 * may edit the task, or whoever added the link) get a remove "×"; the action checks again.
 */
export function EvidenceChips({ taskId, links, removable = [] }: { taskId: string; links: EvidenceLink[]; removable?: string[] }) {
  const [pending, startTransition] = useTransition();
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Evidence">
      {links.map((link) => {
        const name = link.label ?? hostOf(link.url);
        return (
          <li key={link.id} className="flex max-w-full items-center overflow-hidden rounded-md border bg-background text-[13px]">
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 px-2 py-1 hover:bg-accent" title={link.url}>
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{name}</span>
            </a>
            {removable.includes(link.id) ? (
              <button
                type="button"
                aria-label={`Remove evidence: ${name}`}
                disabled={pending}
                className="border-l px-1.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                onClick={() => startTransition(async () => void toastResult(await removeLink({ taskId, linkId: link.id })))}
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
