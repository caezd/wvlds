"use client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function ChatroomAvatarWithPresence({
  src,
  alt,
  fallback,
  online,
  size = 24, // px
  rounded = true,
}: {
  src?: string | null;
  alt?: string;
  fallback?: string;
  online?: boolean;
  size?: number;
  rounded?: boolean;
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
        )}
        style={{ width: size, height: size }}
      >
        <AvatarImage src={src} alt={alt ?? ""} />

        <AvatarFallback>
          {(fallback ?? "?").slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {online && (
        <span
          className={cn(
            "absolute -bottom-1 -right-1 h-2 w-2 z-10 rounded-full ring-2 ring-background",
            "bg-[#58F4A8]", // pastille verte
          )}
        />
      )}
    </div>
  );
}
