import { cn } from "cn";
import { APP_NAME } from "@/lib/constants";

/** The wordmark: a royal-blue tile with a check mark and a gold dot, then the name. */
export function Logo({ className, withName = true }: { className?: string; withName?: boolean }) {
   return (
      <span className={cn("inline-flex items-center gap-2 font-display font-semibold tracking-tight", className)}>
         <span aria-hidden className="relative grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <svg
               viewBox="0 0 16 16"
               className="size-3.5"
               fill="none"
               stroke="currentColor"
               strokeWidth="2"
               strokeLinecap="round"
               strokeLinejoin="round"
            >
               <path d="M3.5 8.5l3 3 6-6.5" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-highlight ring-2 ring-background" />
         </span>
         {withName ? <span>{APP_NAME}</span> : <span className="sr-only">{APP_NAME}</span>}
      </span>
   );
}
