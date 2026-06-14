"use client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function ChatroomAvatarWithPresence({
  src,
  alt,
  fallback,
  presenceState = "offline",
  size = 24,
  rounded = true,
  className,
}: {
  src?: string | null;
  alt?: string;
  fallback?: string;
  presenceState?: "online" | "offline" | "invisible";
  size?: number;
  rounded?: boolean;
  className?: string;
}) {
  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      <Avatar
        className={cn(
          "outline outline-hover-400",
          rounded ? "rounded-[4px]" : "rounded-none",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <AvatarImage src={src ?? undefined} alt={alt ?? ""} />
        <AvatarFallback>
          {(fallback ?? "?").slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {presenceState === "online" && (
        <span className="absolute -bottom-1 -right-1 h-2 w-2 z-10 rounded-full ring-2 ring-background bg-[#58F4A8]" />
      )}
      {presenceState === "offline" && (
        <span className="absolute -bottom-1 -right-1 h-2 w-2 z-10 rounded-full ring-2 ring-background bg-red-500" />
      )}
      {/* invisible → aucune pastille */}
    </div>
  );
}
