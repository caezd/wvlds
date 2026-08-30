"use client";

// Briques communes aux éditeurs de champ de fiche : un identifiant, le bouton
// de choix d'icône et le sélecteur de catalogue.

import { useState } from "react";
import Image from "next/image";
import { ImageIcon, Plus } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WorldInventoryItem, WorldSkill } from "@/types/worlds";
import { RpgIconPicker } from "../RpgIconPicker";

/**
 * Identifiant local d'un item de champ.
 *
 * Il ne sert qu'à la clé React et au repérage pendant l'édition : les champs
 * sont enregistrés en bloc, la base ne voit jamais cette valeur.
 */
export function makeItemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function IconButton({
  icon,
  onChangeIcon,
}: {
  icon: string | undefined;
  onChangeIcon: (v: string | undefined) => void;
}) {
  return (
    <RpgIconPicker
      value={icon}
      onChange={onChangeIcon}
      trigger={
        <button
          type="button"
          title={icon ? icon.replace(".svg", "") : "Choisir une icône"}
          className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40 hover:bg-muted transition-colors"
        >
          {icon ? (
            <Image src={`/rpg_icons/${icon}`} alt="" unoptimized width={24} height={24} className="h-6 w-6 object-contain dark:invert" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
          )}
        </button>
      }
    />
  );
}

export function CatalogPicker<T extends WorldInventoryItem | WorldSkill>({
  available,
  label,
  onSelect,
}: {
  available: T[];
  label: string;
  onSelect: (item: T) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={available.length === 0}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="h-3.5 w-3.5" /> {available.length === 0 ? `Tous les ${label}s du catalogue sont ajoutés` : `Ajouter depuis le catalogue`}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Choisir {available.length === 1 ? "un " + label : "un " + label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-80 overflow-y-auto -mx-1 px-1">
            {available.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onSelect(item); setOpen(false); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted transition-colors"
              >
                <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40">
                  {item.icon ? (
                    <Image src={`/rpg_icons/${item.icon}`} alt="" unoptimized width={20} height={20} className="h-5 w-5 object-contain dark:invert" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
