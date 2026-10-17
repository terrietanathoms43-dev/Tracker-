import type { ComponentProps } from "react";
import { NativeSelect } from "@/components/native-select";

/**
 * Every IANA zone as a native <select> (hundreds of options: a native list scrolls and type-searches well on
 * phones). The list comes from the server (`timeZoneOptions()`), so server and client render the same options.
 */
export function TimezoneSelect({
  zones,
  emptyLabel,
  ...props
}: ComponentProps<typeof NativeSelect> & { zones: string[]; emptyLabel?: string }) {
  return (
    <NativeSelect {...props}>
      {emptyLabel ? <option value="">{emptyLabel}</option> : null}
      {zones.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replaceAll("_", " ")}
        </option>
      ))}
    </NativeSelect>
  );
}
