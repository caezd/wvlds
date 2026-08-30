"use client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StoredImage } from "@/components/ui/stored-image";
import { cn } from "@/lib/utils";

export function ChatroomAvatarWithPresence({
  url,
  alt,
  fallback,
  presenceState = "offline",
  size = 24,
  rounded = true,
  className,
}: {
  /** URL telle qu'enregistrée en base : `StoredImage` en dérive lui-même la
   *  vignette floutée et l'image finale (voir components/ui/stored-image.tsx). */
  url?: string | null;
  alt?: string;
  fallback?: string;
  presenceState?: "online" | "away" | "offline" | "invisible";
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
          "border",
          rounded ? "rounded-md" : "rounded-none",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {/* Le repli passe en premier : il reste dessous, visible tant qu'il
            n'y a pas d'image — `StoredImage` ne rend rien sans URL. */}
        <AvatarFallback>
          {(fallback ?? "?").slice(0, 1).toUpperCase()}
        </AvatarFallback>
        <StoredImage url={url} width={size * 3} alt={alt ?? ""} className="object-cover" />
      </Avatar>

      {presenceState === "online" && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 z-10 rounded-full ring-2 ring-background bg-[#58F4A8]" />
      )}
      {presenceState === "away" && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 z-10 rounded-full ring-2 ring-background bg-orange-400" />
      )}
      {presenceState === "offline" && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 z-10 rounded-full ring-2 ring-background bg-red-500" />
      )}
      {/* invisible → aucune pastille */}
    </div>
  );
}
