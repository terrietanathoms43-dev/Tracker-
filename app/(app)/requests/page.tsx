import { redirect } from "next/navigation";

// Requests became proposals on 2026-11-03 (docs/PLAN.md): the old address lands on the new page.

export default function RequestsRedirect() {
  redirect("/proposals");
}
