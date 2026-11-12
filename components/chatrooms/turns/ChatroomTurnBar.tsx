"use client";

import { useTranslations } from "next-intl";
import { ListOrdered, SkipForward } from "lucide-react";
import { currentPlayerId, isTurnActive, upcomingPlayerIds, type ChatroomTurn } from "@/lib/chatroomTurns";
import { cn } from "@/lib/utils";
import { useProfileNames } from "./useProfileNames";

/**
 * Bandeau de l'ordre de passage, au-dessus du composeur : « à toi de jouer »
 * ou « au tour de X », puis les suivants. Informatif — poster hors tour reste
 * possible. Qui règle l'ordre peut passer au joueur suivant.
 */
export function ChatroomTurnBar({
  turn,
  selfId,
  canManage,
  onSkip,
}: {
  turn: ChatroomTurn | null;
  selfId: string | null;
  canManage: boolean;
  onSkip: () => void;
}) {
  const t = useTranslations("chatrooms");
  const names = useProfileNames(turn?.order_user_ids ?? []);
  if (!isTurnActive(turn)) return null;

  const courant = currentPlayerId(turn);
  const aMoi = !!selfId && courant === selfId;
  const suivants = upcomingPlayerIds(turn, 2).map((id) => names[id] ?? "…");

  return (
    <div
      className={cn(
        "mb-2 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
        aMoi ? "border-primary/40 bg-primary/10 text-foreground" : "border-border-soft bg-muted/30 text-muted-foreground",
      )}
      data-testid="turn-bar"
      role="status"
    >
      <ListOrdered className="h-4 w-4 shrink-0" />
      <span className={cn("truncate", aMoi && "font-medium")}>
        {aMoi ? t("turnYours") : t("turnOf", { name: (courant && names[courant]) ?? "…" })}
      </span>
      {suivants.length > 0 && (
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          · {t("turnNext", { names: suivants.join(", ") })}
        </span>
      )}
      {canManage && (
        <button
          type="button"
          onClick={onSkip}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-muted hover:text-foreground"
        >
          <SkipForward className="h-3.5 w-3.5" />
          {t("turnSkip")}
        </button>
      )}
    </div>
  );
}
