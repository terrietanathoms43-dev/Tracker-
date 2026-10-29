import "server-only";
import { cookies } from "next/headers";
import { HOME_TABS_COOKIE, type OrgRole } from "@/lib/constants";
import { decodeTabConfig, type HomeTabConfig } from "@/lib/home-tabs";

/** The person's /home tab configuration, read from the browser-owned cookie (lib/home-tabs.ts). */
export async function readHomeTabConfig(role: OrgRole): Promise<HomeTabConfig> {
  const raw = (await cookies()).get(HOME_TABS_COOKIE)?.value;
  if (!raw) return decodeTabConfig(undefined, role);
  try {
    return decodeTabConfig(decodeURIComponent(raw), role);
  } catch {
    return decodeTabConfig(raw, role);
  }
}
