import "server-only";
import { cookies } from "next/headers";
import { HOME_TABS_COOKIE, type OrgRole } from "@/lib/constants";
import { getOrgConfig } from "@/lib/dal/org-config";
import { decodeTabConfig, type HomeTabConfig } from "@/lib/home-tabs";

/** The person's /home tab configuration: their cookie over the workspace's default order (org_config). */
export async function readHomeTabConfig(role: OrgRole, orgId: string): Promise<HomeTabConfig> {
  const [jar, config] = await Promise.all([cookies(), getOrgConfig(orgId)]);
  const raw = jar.get(HOME_TABS_COOKIE)?.value;
  if (!raw) return decodeTabConfig(undefined, role, config.homeTabOrder);
  try {
    return decodeTabConfig(decodeURIComponent(raw), role, config.homeTabOrder);
  } catch {
    return decodeTabConfig(raw, role, config.homeTabOrder);
  }
}
