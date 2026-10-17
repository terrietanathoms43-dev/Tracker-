import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAbsolute, formatRelative } from "@/lib/time";

/**
 * "3 hours ago", with the absolute time in the viewer's timezone on hover. Render it on the server inside a
 * request-time boundary (it reads the clock); the client only receives the two strings.
 */
export function RelativeTime({
  date,
  timeZone,
  now = new Date(),
  className,
}: {
  date: Date;
  timeZone: string;
  now?: Date;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={date.toISOString()} className={cn("whitespace-nowrap", className)}>
          {formatRelative(date, now, timeZone)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatAbsolute(date, timeZone)}</TooltipContent>
    </Tooltip>
  );
}
