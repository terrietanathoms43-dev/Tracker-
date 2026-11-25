import type { ReactNode } from "react";
import { StatusCatalogProvider } from "@/components/status-catalog";
import { getViewer } from "@/lib/viewer";
import { DEFAULT_STATUSES } from "@/lib/statuses";

// Wraps only {children} in app/(app)/layout.tsx: the static frame streams untouched while the workspace's
// statuses reach every client component below (getViewer is request-cached with each page's requireViewer).
export async function StatusBoundary({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  return <StatusCatalogProvider statuses={viewer?.statuses ?? DEFAULT_STATUSES}>{children}</StatusCatalogProvider>;
}
