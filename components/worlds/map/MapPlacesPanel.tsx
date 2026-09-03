"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import type { MapPin, WorldMapData } from "@/app/actions/worldMap";

/**
 * La liste des lieux d'un monde, avec recherche.
 *
 * Retrouver un lieu supposait jusqu'ici de le VOIR : il fallait promener la
 * carte à l'œil, et si le lieu était sur une autre carte, savoir laquelle. La
 * recherche traverse donc toutes les cartes — c'est elle qui répond à « où est
 * ce village, déjà ? ».
 *
 * C'est aussi la réponse au parcours au clavier : cinquante épingles, c'est
 * cinquante tabulations avant de sortir de la carte. Ici, la liste est un
 * chemin court et ordonné vers n'importe lequel d'entre eux.
 */
export function MapPlacesPanel({
  maps,
  pins,
  activeMapId,
  selectedPinId,
  onSelect,
  onClose,
}: {
  maps: WorldMapData[];
  /** Toutes les épingles du monde, cartes confondues. */
  pins: MapPin[];
  activeMapId: string | null;
  selectedPinId: string | null;
  onSelect: (pin: MapPin) => void;
  onClose: () => void;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const [query, setQuery] = React.useState("");

  const requete = query.trim().toLowerCase();
  const correspond = React.useCallback(
    (p: MapPin) =>
      !requete ||
      p.title.toLowerCase().includes(requete) ||
      (p.description ?? "").toLowerCase().includes(requete),
    [requete],
  );

  const surCetteCarte = pins.filter((p) => p.map_id === activeMapId && correspond(p));
  // Les autres cartes n'apparaissent qu'en cherchant : sans recherche, la liste
  // doit décrire ce qu'on a sous les yeux.
  const ailleurs = requete ? pins.filter((p) => p.map_id !== activeMapId && correspond(p)) : [];
  const parCarte = maps
    .filter((m) => m.id !== activeMapId)
    .map((m) => ({ carte: m, lieux: ailleurs.filter((p) => p.map_id === m.id) }))
    .filter((g) => g.lieux.length > 0);

  const rienDuTout = surCetteCarte.length === 0 && parCarte.length === 0;

  return (
    <aside
      aria-label={t("places")}
      onClick={(e) => e.stopPropagation()}
      className="flex w-60 shrink-0 flex-col border-r border-border-soft bg-background"
    >
      <div className="flex items-center gap-1 border-b border-border-soft px-2 py-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("searchPlaces")}
            placeholder={t("searchPlaces")}
            className="w-full rounded-md border border-border bg-background py-1 pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          type="button"
          aria-label={t("hidePlaces")}
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {rienDuTout && (
          <p className="px-2 py-3 text-xs italic text-muted-foreground">
            {requete ? t("noPlaceFound") : t("noPlaces")}
          </p>
        )}

        {surCetteCarte.map((pin) => (
          <PlaceButton
            key={pin.id}
            pin={pin}
            selected={pin.id === selectedPinId}
            onSelect={onSelect}
          />
        ))}

        {parCarte.length > 0 && (
          <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("onOtherMaps")}
          </p>
        )}
        {parCarte.map(({ carte, lieux }) => (
          <div key={carte.id}>
            <p className="px-2 py-1 text-[11px] text-muted-foreground">
              {carte.label?.trim() || t("title")}
            </p>
            {lieux.map((pin) => (
              <PlaceButton
                key={pin.id}
                pin={pin}
                selected={pin.id === selectedPinId}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>

      <span className="sr-only">{tCommon("close")}</span>
    </aside>
  );
}

function PlaceButton({
  pin,
  selected,
  onSelect,
}: {
  pin: MapPin;
  selected: boolean;
  onSelect: (pin: MapPin) => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(pin)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: pin.color || "transparent" }}
      >
        {pin.icon && (
          <LazyLucideIcon name={pin.icon} className="h-2.5 w-2.5" style={{ color: pin.icon_color || "#ffffff" }} />
        )}
      </span>
      <span className="truncate">{pin.title}</span>
    </button>
  );
}
