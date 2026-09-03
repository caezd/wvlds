"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { MAX_MAPS_PER_WORLD } from "@/lib/constants";
import type { WorldMapData } from "@/app/actions/worldMap";

/** Identifiant DOM d'un onglet, partagé avec le panneau qu'il commande. */
export const mapTabId = (mapId: string) => `map-tab-${mapId}`;
export const MAP_PANEL_ID = "map-panel";

/**
 * Les cartes d'un monde, en onglets.
 *
 * La barre ne paraît que lorsqu'elle sert : un monde à carte unique la garde
 * cachée et la carte occupe tout le cadre, comme avant. En mode édition, elle
 * s'affiche dès la première carte — c'est là que se trouve le bouton d'ajout.
 *
 * Le motif ARIA des onglets est suivi jusqu'au bout : un seul onglet dans
 * l'ordre de tabulation, les flèches passent de l'un à l'autre, `Origine` et
 * `Fin` sautent aux extrémités. À moitié implémenté, il vaudrait moins que de
 * simples boutons — un lecteur d'écran annoncerait « onglet 2 sur 3 » pour une
 * liste que le clavier ne parcourt pas.
 */
export function MapTabs({
  maps,
  activeId,
  isEditMode,
  creating,
  onSelect,
  onAdd,
}: {
  maps: WorldMapData[];
  activeId: string | null;
  isEditMode: boolean;
  creating: boolean;
  onSelect: (mapId: string) => void;
  onAdd: () => void;
}) {
  const t = useTranslations("map");
  const complet = maps.length >= MAX_MAPS_PER_WORLD;

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const pas =
      e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? 0 : e.key === "End" ? 0 : null;
    if (pas === null) return;
    e.preventDefault();

    const courant = maps.findIndex((m) => m.id === activeId);
    const cible =
      e.key === "Home"
        ? maps[0]
        : e.key === "End"
          ? maps[maps.length - 1]
          : maps[(Math.max(0, courant) + pas + maps.length) % maps.length];
    if (!cible) return;

    onSelect(cible.id);
    // Le focus suit la sélection : c'est ce qu'attend le motif ARIA quand les
    // onglets s'activent au déplacement.
    //
    // Déplacé TOUT DE SUITE, sans attendre le rendu : tous les onglets sont
    // déjà dans le DOM, seul leur `tabIndex` change. Différer d'une image
    // laissait au contraire une tâche en vol capable de voler le focus après
    // le démontage du composant — c'est ce qui rendait un test instable une
    // fois sur trois.
    document.getElementById(mapTabId(cible.id))?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={t("mapsTablist")}
      onKeyDown={handleKeyDown}
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border-soft bg-background px-2 py-1"
    >
      {maps.map((carte) => {
        const actif = carte.id === activeId;
        return (
          <button
            key={carte.id}
            id={mapTabId(carte.id)}
            type="button"
            role="tab"
            aria-selected={actif}
            aria-controls={MAP_PANEL_ID}
            // Roving tabindex : la tabulation entre dans la barre et en sort,
            // les flèches circulent dedans.
            tabIndex={actif ? 0 : -1}
            onClick={(e) => { e.stopPropagation(); onSelect(carte.id); }}
            className={cn(
              "shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              actif
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {carte.label?.trim() || t("title")}
          </button>
        );
      })}

      {isEditMode && (
        <button
          type="button"
          aria-label={t("addMap")}
          title={complet ? t("maxMapsReached") : t("addMap")}
          disabled={complet || creating}
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
