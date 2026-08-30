import Image from "next/image";
import { ChatroomAvatarWithPresence } from "../chatrooms/persona/ChatroomAvatarWithPresence";

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
        // L'URL brute descend telle quelle : c'est `StoredImage` qui décide
        // des tailles demandées, en un seul endroit (`size * 3` pour couvrir
        // les écrans 3x DPR, où un avatar de 128 px CSS occupe 384 pixels
        // physiques).
        url={src}
        alt={alt ?? "User"}
        fallback={fallback ?? "?"}
        presenceState={resolved}
        size={size}
        rounded={frameUrl ? false : true}
        className={className}
      />
      {frameUrl && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2">
          <Image src={frameUrl} alt="" unoptimized fill sizes={`${Math.round(size * 1.2)}px`} className="object-contain" />
        </div>
      )}
    </div>
  );
}
