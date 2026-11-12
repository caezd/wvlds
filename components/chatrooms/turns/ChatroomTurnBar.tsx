"use client";

import { useTranslations } from "next-intl";
import { ListOrdered, SkipForward } from "lucide-react";
import { currentPlayerId, isTurnActive, upcomingPlayerIds, type ChatroomTurn } from "@/lib/chatroomTurns";
import { cn } from "@/lib/utils";
import { useProfileNames } from "./useProfileNames";

/**
 * Ordre de passage, en languette accrochée au haut du composeur (même style
 * que « … est en train d'écrire ») : « À toi de jouer » ou « Au tour de X »,
 * puis les suivants. Informatif — poster hors tour reste possible. Qui règle
 * l'ordre peut passer au joueur suivant.
 *
 * Le composeur la place (prop `topTab`) : -mb-2.5 sous sa carte, d'où le
 * pb-4 ici pour que le texte reste visible au-dessus.
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
      className="flex w-full items-center gap-2 rounded-t-2xl border border-b-0 border-border bg-body px-4 pt-1.5 pb-4 text-xs text-muted-foreground"
      data-testid="turn-bar"
      role="status"
    >
      <ListOrdered className={cn("h-3.5 w-3.5 shrink-0", aMoi && "text-primary")} />
      <span className={cn("truncate", aMoi && "font-medium text-foreground")}>
        {aMoi ? t("turnYours") : t("turnOf", { name: (courant && names[courant]) ?? "…" })}
      </span>
      {suivants.length > 0 && (
        <span className="hidden truncate italic sm:inline">
          · {t("turnNext", { names: suivants.join(", ") })}
        </span>
      )}
      {canManage && (
        <button
          type="button"
          onClick={onSkip}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
        >
          <SkipForward className="h-3 w-3" />
          {t("turnSkip")}
        </button>
      )}
    </div>
  );
}
