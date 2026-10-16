"use client";

import { useEffect, useRef, type ReactNode } from "react";

type DialogShellProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   title: string;
   subtitle?: string;
   sidebar?: ReactNode;
   wide?: boolean;
   children: ReactNode;
   footer?: ReactNode;
};

export default function DialogShell({ open, onOpenChange, title, subtitle, sidebar, wide, children, footer }: DialogShellProps) {
   const overlayRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
      if (!open) return;
      const previousOverflow = document.body.style.overflow;
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.body.style.overflow = "hidden";
      overlayRef.current?.querySelector<HTMLButtonElement>(".dialogClose")?.focus();
      function onKey(event: KeyboardEvent) {
         if (event.key !== "Escape" || event.defaultPrevented) return;
         const dialogs = document.querySelectorAll('.dialogOverlay[role="dialog"]');
         // Only the topmost dialog handles Escape. Keep the parent dialog open.
         if (dialogs.item(dialogs.length - 1) !== overlayRef.current) return;
         event.preventDefault();
         onOpenChange(false);
      }
      window.addEventListener("keydown", onKey);
      return () => {
         window.removeEventListener("keydown", onKey);
         document.body.style.overflow = previousOverflow;
         previousFocus?.focus();
      };
   }, [open, onOpenChange]);

   if (!open) return null;

   return (
      <div className="dialogOverlay" ref={overlayRef} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => { if (event.target === event.currentTarget) onOpenChange(false); }}>
         <div
            className={"dialogPanel" + (wide || sidebar ? " dialogWide" : "") + (sidebar ? " dialogWithSidebar" : "")}
         >
            {sidebar ? (
               <div className="dialogSplit">
                  <aside className="dialogSidebar">
                     <div className="dialogSideHead">
                        <span className="eyebrow blue">WORKSPACE</span>
                        <h2>{title}</h2>
                        {subtitle && <p className="muted">{subtitle}</p>}
                     </div>
                     {sidebar}
                  </aside>
                  <div className="dialogMain">
                     <div className="dialogHeader">
                        <h2>{subtitle || title}</h2>
                        <button type="button" className="dialogClose" onClick={() => onOpenChange(false)} aria-label="Close">
                           ×
                        </button>
                     </div>
                     <div className="dialogBody">{children}</div>
                     {footer ? <div className="dialogFooter">{footer}</div> : null}
                  </div>
               </div>
            ) : (
               <>
                  <div className="dialogHeader">
                     <h2>{title}</h2>
                     <button type="button" className="dialogClose" onClick={() => onOpenChange(false)} aria-label="Close">
                        ×
                     </button>
                  </div>
                  <div className="dialogBody">{children}</div>
                  {footer ? <div className="dialogFooter">{footer}</div> : null}
               </>
            )}
         </div>
      </div>
   );
}
