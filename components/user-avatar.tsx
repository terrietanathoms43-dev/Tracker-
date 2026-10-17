import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function initialsOf(name: string | null | undefined, email?: string | null): string {
  const source = (name ?? "").trim() || (email ?? "").split("@")[0] || "?";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[words.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export function UserAvatar({
  name,
  email,
  image,
  size = "default",
  className,
}: {
  name: string | null;
  email?: string | null;
  image?: string | null;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback
        className={cn("bg-secondary font-medium text-secondary-foreground", size === "sm" ? "text-[10px]" : "text-xs")}
      >
        {initialsOf(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
