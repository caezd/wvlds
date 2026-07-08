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
        <Image
          src={frameUrl}
          alt=""
          width={Math.round(size * 1.2)}
          height={Math.round(size * 1.2)}
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none"
        />
      )}
    </div>
  );
}
