"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DiceBlock } from "@/lib/chat-blocks";
import type { DiceRoll } from "@/lib/worldDice";
import { DiceBlockView } from "./DiceBlock";
import { GameBlockToolbar } from "./GameBlockShell";
import { useChatroomDiceRules } from "./chatroomDiceRules";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * Rendu d'un message « lancé de dé » : la ligne et la carte du lancer
 * (DiceBlockView), avec édition inline de la description et suppression au
 * survol.
 * Structurellement différent des autres blocs (pas de carte, pas d'avatar),
 * d'où son propre composant.
 *
 * Migration 270 : le résultat vient du lancer tiré par la base (`roll`). Un
 * lancer se modifie seulement si le monde le permet ; dans un monde aux dés
 * prédéfinis, un lancer sans ligne en base est marqué « Non vérifié ».
 */
export function DiceMessageView({
  block,
  roll,
  label,
  mine,
  attached,
  onEditLabel,
  onDelete,
}: {
  block: DiceBlock;
  /** Le lancer joint au message (`dice_roll`), s'il en a un. */
  roll?: DiceRoll | null;
  label: string;
  mine: boolean;
  /** Rattaché à la réponse du même persona : centré sous elle, les actions à droite. */
  attached?: boolean;
  onEditLabel: (label: string) => void | Promise<void>;
  onDelete: () => void;
}) {
  const t = useTranslations("chatrooms");
  const { mode, allowEdit } = useChatroomDiceRules();
  const unverified = !roll && mode === "predefined";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  async function save() {
    await onEditLabel(draft.trim());
    setEditing(false);
  }

  return (
    <div
      className={cn(
        "group/gblock w-full py-4 flex items-center justify-between gap-4",
        attached && "relative justify-center",
      )}
    >
      <DiceBlockView
        block={block}
        roll={roll}
        author={<strong className="font-medium text-foreground">{label}</strong>}
      >
        {unverified && (
          <Badge tone="warning" className="ml-2 align-middle" title={t("diceUnverifiedHint")}>
            {t("diceUnverified")}
          </Badge>
        )}
        {editing && (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Description…"
            className="ml-2 bg-transparent border-b border-border focus:border-primary outline-none text-sm text-foreground w-36"
          />
        )}
      </DiceBlockView>
      <GameBlockToolbar
        mine={mine}
        className={cn("shrink-0", attached && "absolute right-0 rounded-md bg-background")}
        editDialog={allowEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={t("editDescription")}
            onClick={() => {
              setDraft(block.label ?? "");
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : undefined}
        onDelete={onDelete}
        deleteDescription="Le lancé de dé sera supprimé définitivement."
      />
    </div>
  );
}
