"use client";

import { cn } from "cn";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { canGoBackInApp } from "@/lib/in-app-history";

// The arrow at the top of a page (docs/PLAN.md, 2026-11-11 log). It is the browser's Back button: it returns to
// the screen the person came from, as they left it (the router keeps that page, its scroll position and whatever
// was expanded), instead of sending everyone to one fixed list. When there is nothing behind the page in this tab
// (a task opened in a new tab or from an email), it is the plain link it used to be, to `href`, and says where
// that leads.

const subscribe = () => () => {};

export function BackLink({ href, label, className }: { href: string; label: string; className?: string }) {
  const router = useRouter();
  // The server (and the hydrating render) cannot know the tab's history, so they draw the plain link.
  const back = useSyncExternalStore(subscribe, canGoBackInApp, () => false);
  return (
    <Link
      href={href}
      data-back-link={back ? "back" : "link"}
      className={cn("inline-flex items-center gap-1.5 rounded-md text-[13px] text-muted-foreground hover:text-foreground", className)}
      onClick={(event) => {
        // A modified click (new tab, new window) is still the link; a plain one goes back when there is a back.
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!canGoBackInApp()) return;
        event.preventDefault();
        router.back();
      }}
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      {back ? "Back" : label}
    </Link>
  );
}
