import Image from "next/image";
import { ChatroomAvatarWithPresence } from "../chatrooms/ChatroomAvatarWithPresence";
import { supabaseThumb } from "@/lib/storage";

export function AvatarWithFrame({
  src,
  alt,
  fallback,
  online,
  presenceState,
  size = 48,
  frameUrl,
  className,
}: {
  src?: string | null;
  alt?: string | null;
  fallback?: string;
  /** @deprecated use presenceState */
  online?: boolean;
  presenceState?: "online" | "away" | "offline" | "invisible";
  size?: number;
  frameUrl?: string | null;
  className?: string;
}) {
  const resolved: "online" | "away" | "offline" | "invisible" =
    presenceState ?? (online ? "online" : "offline");

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ChatroomAvatarWithPresence
        src={supabaseThumb(src, size * 2) ?? src ?? undefined}
        alt={alt ?? "User"}
        fallback={fallback ?? "?"}
        presenceState={resolved}
        size={size}
        rounded={frameUrl ? false : true}
        className={className}
      />
      {frameUrl && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2">
          <Image src={frameUrl} alt="" fill sizes={`${Math.round(size * 1.2)}px`} className="object-contain" />
        </div>
      )}
    </div>
  );
}
