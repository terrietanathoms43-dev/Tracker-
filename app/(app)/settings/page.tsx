import type { Metadata } from "next";
import { db } from "@/db";
import { LeaveWorkspace } from "@/components/settings/leave-workspace";
import { NotificationPreferences } from "@/components/settings/notification-preferences";
import { ProfileForm } from "@/components/settings/profile-form";
import { getPreferences } from "@/lib/dal/notifications";
import { otherAdminCount } from "@/lib/dal/orgs";
import { isAdmin } from "@/lib/permissions";
import { timeZoneOptions } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

export const metadata: Metadata = { title: "Settings" };

/** Settings → Profile: "change one fact about me". Name and timezone, email preferences, and leaving the workspace. */
export default async function ProfileSettingsPage() {
  const { viewer, user, org } = await requireViewerContext();
  const [preferences, otherAdmins] = await Promise.all([
    getPreferences(user.id),
    isAdmin(viewer) ? otherAdminCount(db, viewer.orgId, viewer.userId) : Promise.resolve(1),
  ]);

  return (
    <div className="grid gap-6">
      <ProfileForm name={user.name ?? ""} email={user.email} timezone={user.timezone ?? ""} orgTimezone={org.timezone} zones={timeZoneOptions()} />
      <NotificationPreferences initial={preferences} email={user.email} />
      <LeaveWorkspace orgName={org.name} soleAdmin={otherAdmins === 0} />
    </div>
  );
}
