import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";

// Settings: one header and the Profile | Workspace tabs around both pages. Static, so it prerenders; each page
// reads the session behind its own loading.tsx.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" />
      <SettingsTabs />
      {children}
    </div>
  );
}
