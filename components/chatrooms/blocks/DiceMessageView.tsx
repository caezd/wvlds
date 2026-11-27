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
  onEditLabel,
  onDelete,
}: {
  block: DiceBlock;
  /** Le lancer joint au message (`dice_roll`), s'il en a un. */
  roll?: DiceRoll | null;
  label: string;
  mine: boolean;
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
    // Toujours centré, qu'il suive une réponse ou non ; les actions à droite.
    <div className="group/gblock relative flex w-full items-center justify-center py-4">
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
        className="absolute right-0 shrink-0 rounded-md bg-background"
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
