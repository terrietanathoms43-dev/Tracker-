import { cn } from "cn";
import type { ReactNode } from "react";

/** A settings card: a titled header row, then its content. `tone="danger"` marks the irreversible ones. */
export function Section({
  id,
  title,
  description,
  action,
  tone = "default",
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "danger";
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-20 rounded-lg border bg-card", tone === "danger" && "border-destructive/40")}
    >
      <div className={cn("flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5", children ? "border-b" : null)}>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-sm font-semibold">
            {title}
          </h2>
          {description ? <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
