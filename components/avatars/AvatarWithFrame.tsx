import { ChatroomAvatarWithPresence } from "../chatrooms/ChatroomAvatarWithPresence";

export function AvatarWithFrame({
  src,
  alt,
  fallback,
  online,
  presenceState,
  size = 48,
  frameUrl,
}: {
  src?: string | null;
  alt?: string | null;
  fallback?: string;
  /** @deprecated use presenceState */
  online?: boolean;
  presenceState?: "online" | "offline" | "invisible";
  size?: number;
  frameUrl?: string | null;
}) {
  const resolved: "online" | "offline" | "invisible" =
    presenceState ?? (online ? "online" : "offline");

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ChatroomAvatarWithPresence
        src={src ?? undefined}
        alt={alt ?? "User"}
        fallback={fallback ?? "?"}
        presenceState={resolved}
        size={size}
        rounded={frameUrl ? false : true}
      />
      {frameUrl && (
        <img
          src={frameUrl}
          alt=""
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none"
          style={{ width: size * 1.3, height: size * 1.3 }}
        />
      )}
    </div>
  );
}
