import { cn } from "@/lib/utils";

export type PresenceState = "online" | "away" | "offline";

/** La couleur d'une présence : vert en ligne, orange absent, rouge hors ligne. */
export const PRESENCE_BG: Record<PresenceState, string> = {
  online: "bg-online",
  away: "bg-away",
  offline: "bg-offline",
};

export function PresenceDot({
  state,
  className,
}: {
  state: PresenceState;
  className?: string;
}) {
  return <span className={cn("h-2 w-2 rounded-full", PRESENCE_BG[state], className)} />;
}
