"use client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StoredImage } from "@/components/ui/stored-image";
import { avatarThumbWidth } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { PRESENCE_BG } from "@/components/avatars/PresenceDot";

export function ChatroomAvatarWithPresence({
  url,
  alt,
  fallback,
  presenceState = "offline",
  size = 24,
  rounded = true,
  circle = false,
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
  /** Avatar rond : la pastille se pose sur le cercle, pas dans le coin du carré. */
  circle?: boolean;
  className?: string;
}) {
  // Sur un rond, le centre de la pastille (8 px) suit le bord à 45° ;
  // sinon il reste dans le coin, comme ailleurs.
  const inset = circle ? size * (1 - Math.SQRT1_2) / 2 - 4 : undefined;
  const dot = cn(
    "absolute z-10 h-2 w-2 rounded-full ring-2 ring-background",
    !circle && "-bottom-0.5 -right-0.5",
  );
  const dotStyle = circle ? { right: inset, bottom: inset } : undefined;
  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      <Avatar
        className={cn(
          "border",
          circle ? "rounded-full" : rounded ? "rounded-md" : "rounded-none",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {/* Le repli passe en premier : il reste dessous, visible tant qu'il
            n'y a pas d'image — `StoredImage` ne rend rien sans URL. */}
        <AvatarFallback>
          {(fallback ?? "?").slice(0, 1).toUpperCase()}
        </AvatarFallback>
        <StoredImage url={url} width={avatarThumbWidth(size)} alt={alt ?? ""} className="object-cover" />
      </Avatar>

      {/* invisible → aucune pastille */}
      {presenceState !== "invisible" && <span className={cn(dot, PRESENCE_BG[presenceState])} style={dotStyle} />}
    </div>
  );
}
