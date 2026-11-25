"use client";

import { createContext, use, type ReactNode } from "react";
import { DEFAULT_STATUSES, type StatusCatalog } from "@/lib/statuses";

// The workspace's statuses, for every client component that draws or offers one (lib/statuses.ts). Each
// (app) page's server view mounts the provider with the viewer's resolved catalog, so a renamed or custom
// status never flashes its default. Outside a provider (the layout-level dialogs) the defaults stand in —
// those forms get the real catalog on the task's UpdateContext anyway.

const StatusCatalogContext = createContext<StatusCatalog>(DEFAULT_STATUSES);

export function StatusCatalogProvider({ statuses, children }: { statuses: StatusCatalog; children: ReactNode }) {
  return <StatusCatalogContext value={statuses}>{children}</StatusCatalogContext>;
}

/** The workspace's statuses; the built-in defaults when no page has provided them. */
export function useStatusCatalog(): StatusCatalog {
  return use(StatusCatalogContext);
}
