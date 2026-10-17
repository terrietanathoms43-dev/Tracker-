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
   const panelRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
      if (!open) return;
      function onKey(event: KeyboardEvent) {
         if (event.key === "Escape") onOpenChange(false);
      }
      function onClick(event: MouseEvent) {
         if (event.target instanceof HTMLElement && event.target.closest(".dialogPanel") === panelRef.current) return;
         onOpenChange(false);
      }
      window.addEventListener("keydown", onKey);
      window.addEventListener("click", onClick, { capture: true });
      return () => {
         window.removeEventListener("keydown", onKey);
         window.removeEventListener("click", onClick, { capture: true });
      };
   }, [open, onOpenChange]);

   if (!open) return null;

   return (
      <div className="dialogOverlay" role="dialog" aria-modal="true" aria-label={title}>
         <div
            className={"dialogPanel" + (wide || sidebar ? " dialogWide" : "") + (sidebar ? " dialogWithSidebar" : "")}
            ref={panelRef}
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
