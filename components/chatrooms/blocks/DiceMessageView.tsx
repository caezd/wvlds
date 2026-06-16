"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DiceBlock } from "@/lib/chat-blocks";
import { DiceBlockView } from "./DiceBlock";
import { GameBlockToolbar } from "./GameBlockShell";

/**
 * Rendu d'un message « lancé de dé » : une ligne de tour (nom de l'auteur +
 * résultat) avec édition inline de la description et suppression au survol.
 * Structurellement différent des autres blocs (pas de carte, pas d'avatar),
 * d'où son propre composant.
 */
export function DiceMessageView({
  block,
  label,
  mine,
  onEditLabel,
  onDelete,
}: {
  block: DiceBlock;
  label: string;
  mine: boolean;
  onEditLabel: (label: string) => void | Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  async function save() {
    await onEditLabel(draft.trim());
    setEditing(false);
  }

  return (
    <div className="group/gblock w-full py-8 flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground italic">
        <strong className="font-medium not-italic text-foreground">{label}</strong>{" "}
        <DiceBlockView block={block} mine={mine} />
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
            className="ml-2 not-italic bg-transparent border-b border-border focus:border-primary outline-none text-sm text-foreground w-36"
          />
        )}
      </span>
      <GameBlockToolbar
        mine={mine}
        className="shrink-0"
        editDialog={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Modifier la description"
            onClick={() => {
              setDraft(block.label ?? "");
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        }
        onDelete={onDelete}
        deleteDescription="Le lancé de dé sera supprimé définitivement."
      />
    </div>
  );
}
