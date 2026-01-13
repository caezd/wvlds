import { ChatroomAvatarWithPresence } from "../chatrooms/ChatroomAvatarWithPresence";

export function AvatarWithFrame({
  src,
  alt,
  fallback,
  online,
  size = 48,
  frameUrl,
}: {
  src?: string | null;
  alt?: string | null;
  fallback?: string;
  online?: boolean;
  size?: number;
  frameUrl?: string | null; // ← URL du PNG/SVG du cadre
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ChatroomAvatarWithPresence
        src={src ?? undefined}
        alt={alt ?? "User"}
        fallback={fallback ?? "?"}
        online={!!online}
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
