"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Drawer, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import type { MapPin, WorldMapData } from "@/app/actions/worldMap";

type PlacesProps = {
  maps: WorldMapData[];
  /** Toutes les épingles du monde, cartes confondues. */
  pins: MapPin[];
  activeMapId: string | null;
  selectedPinId: string | null;
  onSelect: (pin: MapPin) => void;
  onClose: () => void;
  /**
   * La fiche du lieu ouvert. Présente, elle prend toute la colonne : on ne
   * cherche plus un lieu et on le lit en même temps, et la carte n'est jamais
   * recouverte par ce qu'on lit.
   */
  detail?: React.ReactNode;
  /** Referme la fiche et rend la liste. */
  onCloseDetail?: () => void;
};

/**
 * Ce que la colonne montre : la liste, ou la fiche du lieu ouvert.
 *
 * Le retour est un vrai bouton et non une croix : on ne ferme pas la colonne,
 * on remonte à la liste — ce sont deux gestes différents, et les confondre
 * obligeait à rouvrir la colonne pour choisir un autre lieu.
 */
function ContenuColonne({
  detail,
  onCloseDetail,
  avecRetour = true,
  ...props
}: PlacesProps & { avecRetour?: boolean }) {
  if (!detail) return <PlacesBody {...props} withClose />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {avecRetour && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border-soft px-2 py-1.5">
          <BoutonRetour onClick={onCloseDetail} />
        </div>
      )}
      {detail}
    </div>
  );
}

/** Le chemin vers la liste, d'où qu'on le pose. */
function BoutonRetour({ onClick }: { onClick?: () => void }) {
  const t = useTranslations("map");
  return (
    <button
      type="button"
      onClick={onClick}
      // Petit : c'est un chemin de retour, pas une action. La zone sensible,
      // elle, reste à la taille d'un doigt — sans que le bouton grossisse.
      className={cn(
        "relative flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground",
        "hover:bg-secondary hover:text-foreground",
        "touch:after:absolute touch:after:-inset-2 touch:after:content-['']",
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {t("places")}
    </button>
  );
}

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
 *
 * ── Deux coques, un seul corps ───────────────────────────────
 * En COLONNE quand l'écran est large : elle reste ouverte pendant qu'on clique
 * les épingles, ce qu'un panneau modal interdirait.
 *
 * En TIROIR sous `lg`, où une colonne de 240 px prise sur 390 ne laisserait
 * presque rien à la carte. Le tiroir du dépôt apporte au passage ce qu'un
 * panneau posé à la main n'avait pas : piège à focus, défilement de la page
 * bloqué, `aria-modal`, fermeture au balayage et à Échap.
 */
export function MapPlacesPanel(props: PlacesProps) {
  const t = useTranslations("map");
  return (
    <aside
      aria-label={t("places")}
      onClick={(e) => e.stopPropagation()}
      // Plus large qu'une simple liste : c'est ici que se lit un lieu entier,
      // là où le panneau flottant tenait dans 340 px pris sur la carte.
      className="flex w-80 shrink-0 flex-col border-r border-border-soft bg-background"
    >
      <ContenuColonne {...props} />
    </aside>
  );
}

/** La même liste, en tiroir — sur les écrans où la colonne ne tient pas. */
export function MapPlacesDrawer({ open, ...props }: PlacesProps & { open: boolean }) {
  const t = useTranslations("map");
  return (
    <Drawer
      open={open}
      onOpenChange={(ouvert) => { if (!ouvert) props.onClose(); }}
      swipeDirection="right"
    >
      <SideSheetContent width="compact">
        <DrawerHeader className="border-b border-border-soft px-4 py-3">
          {props.detail ? (
            <>
              {/* Le retour tient lieu de titre : « Lieu » au-dessus d'un
                  « ← Lieux » disait deux fois la même chose, sur deux
                  bandeaux. Le titre reste, pour qui écoute la page. */}
              <BoutonRetour onClick={props.onCloseDetail} />
              <DrawerTitle className="sr-only">{t("place")}</DrawerTitle>
            </>
          ) : (
            <DrawerTitle>{t("places")}</DrawerTitle>
          )}
        </DrawerHeader>
        {/* Le clic ne doit pas remonter jusqu'à la carte, qui referme le
            panneau d'un lieu sur tout clic hors de lui. */}
        <div onClick={(e) => e.stopPropagation()} className="flex min-h-0 flex-1 flex-col">
          <ContenuColonne {...props} avecRetour={false} />
        </div>
      </SideSheetContent>
    </Drawer>
  );
}

/**
 * Recherche et liste. La coque n'en sait rien — ce que l'on tape ici ne
 * regarde ni la colonne, ni le tiroir, ni `WorldMap`.
 *
 * @param withClose la colonne porte sa propre croix ; le tiroir a la sienne.
 */
function PlacesBody({
  maps,
  pins,
  activeMapId,
  selectedPinId,
  onSelect,
  onClose,
  withClose = false,
}: PlacesProps & { withClose?: boolean }) {
  const t = useTranslations("map");
  const [query, setQuery] = React.useState("");

  const requete = query.trim().toLowerCase();
  const correspond = (p: MapPin) =>
    !requete ||
    p.title.toLowerCase().includes(requete) ||
    (p.description ?? "").toLowerCase().includes(requete);

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
    <>
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
        {withClose && (
          <button
            type="button"
            aria-label={t("hidePlaces")}
            onClick={onClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {rienDuTout && (
          <p className="px-2 py-3 text-xs italic text-muted-foreground">
            {requete ? t("noPlaceFound") : t("noPlaces")}
          </p>
        )}

        {surCetteCarte.map((pin) => (
          <PlaceButton key={pin.id} pin={pin} selected={pin.id === selectedPinId} onSelect={onSelect} />
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
              <PlaceButton key={pin.id} pin={pin} selected={pin.id === selectedPinId} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </div>
    </>
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
