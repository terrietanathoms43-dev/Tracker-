import { redirect } from "next/navigation";

// /capture lives on the Draft tab now (docs/PLAN.md, 2026-11-04 log): paste or upload notes there and turn them into
// work. Old links land on the tab.

export default function CapturePage() {
  redirect("/home?view=draft");
}
