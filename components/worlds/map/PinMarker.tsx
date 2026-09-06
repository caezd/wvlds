"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Layers, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { type MapPin as MapPinType } from "@/app/actions/worldMap";

/**
 * Une épingle posée sur la carte.
 *
 * Mémoïsé, et sans prop d'échelle : la contre-échelle qui remet le marqueur
 * d'aplomb quand la carte est agrandie passe par la variable CSS
 * `--pin-inv-scale`, posée sur le cadre par `WorldMap`. Chaque cran de zoom
 * re-rendait auparavant les N marqueurs de la carte, icône comprise.
 *
 * Les rappels reçoivent l'épingle en argument, au lieu d'être fermés sur elle
 * par l'appelant : c'est la condition pour qu'ils gardent leur identité d'un
 * rendu à l'autre — et donc pour que la mémoïsation serve à quelque chose.
 */
export const PinMarker = React.memo(function PinMarker({
  pin,
  isSelected,
  isEditMode,
  imgRef,
  outOfTime = false,
  showLabel = true,
  presentCount = 0,
  onPinClick,
  onDelete,
  onMoved,
}: {
  pin: MapPinType;
  isSelected: boolean;
  isEditMode: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
  /** Le lieu n'existe pas à l'époque affichée — voir migration 156. */
  outOfTime?: boolean;
  /** Son nom recouvrirait celui d'un voisin : on le tait — voir `labels.ts`. */
  showLabel?: boolean;
  /** Combien de personas s'y trouvent — voir migration 154. */
  presentCount?: number;
  onPinClick: (pin: MapPinType) => void;
  onDelete: (pin: MapPinType) => void;
  onMoved: (pin: MapPinType, x: number, y: number) => void;
}) {
  const t = useTranslations("map");
  const [localX, setLocalX] = React.useState(pin.x);
  const [localY, setLocalY] = React.useState(pin.y);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStart = React.useRef<{
    clientX: number; clientY: number; startX: number; startY: number;
  } | null>(null);
  const didDrag = React.useRef(false);
  /** Un déplacement se termine par un `click` : il ne doit pas ouvrir le lieu. */
  const suppressClick = React.useRef(false);

  // Sync position quand le pin change depuis l'extérieur (realtime)
  React.useEffect(() => {
    if (!isDragging) { setLocalX(pin.x); setLocalY(pin.y); }
  }, [pin.x, pin.y, isDragging]);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation(); // empêche le pan du container
    dragStart.current = { clientX: e.clientX, clientY: e.clientY, startX: pin.x, startY: pin.y };
    didDrag.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragStart.current || !isEditMode) return;
    const dx = e.clientX - dragStart.current.clientX;
    const dy = e.clientY - dragStart.current.clientY;
    if (!didDrag.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      didDrag.current = true;
      setIsDragging(true);
    }
    if (!didDrag.current) return;
    const img = imgRef.current;
    if (!img) return;
    // getBoundingClientRect tient compte du scale CSS appliqué au parent
    const r = img.getBoundingClientRect();
    setLocalX(Math.max(0, Math.min(100, dragStart.current.startX + (dx / r.width) * 100)));
    setLocalY(Math.max(0, Math.min(100, dragStart.current.startY + (dy / r.height) * 100)));
  }

  function handlePointerUp() {
    const wasDrag = didDrag.current;
    dragStart.current = null;
    didDrag.current = false;
    setIsDragging(false);
    if (wasDrag && isEditMode) onMoved(pin, localX, localY);
    // Le `click` qui suit est consommé par `handleClick`.
    suppressClick.current = wasDrag;
  }

  // L'ouverture passe par `click` et non par `pointerup` : c'est le seul
  // événement que produisent AUSSI la touche Entrée et la barre d'espace sur un
  // bouton. Le marqueur était un `div` porteur d'un `aria-label` — ni focusable,
  // ni annoncé : aucun lieu de la carte n'était atteignable sans souris.
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation(); // empêche handleContainerClick
    if (suppressClick.current) { suppressClick.current = false; return; }
    onPinClick(pin);
  }

  return (
    <div
      data-out-of-time={outOfTime || undefined}
      title={outOfTime ? t("outOfTime") : undefined}
      // Estompé, pas caché : on voit qu'un lieu a existé, ou existera — et
      // l'éditeur peut toujours l'ouvrir pour corriger ses dates.
      className={cn("absolute group", isDragging ? "z-30" : "z-10", outOfTime && "opacity-30 grayscale")}
      style={{
        left: `${localX}%`,
        top: `${localY}%`,
        transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
        transformOrigin: "center center",
      }}
    >
      {/* Halo sélectionné */}
      {isSelected && !isDragging && pin.color && pin.color !== "transparent" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -m-1.5 rounded-full animate-ping opacity-30"
          style={{ backgroundColor: pin.color }}
        />
      )}

      {/* Cercle du pin */}
      <button
        type="button"
        // Repère du bouton pour lui rendre le focus à la fermeture du panneau
        // (cf. `closePopover` dans WorldMap).
        data-pin-id={pin.id}
        aria-label={pin.title}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-transform",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2",
          // 32 px de marqueur, c'est petit pour un doigt. La zone sensible
          // s'étend sans que le marqueur grossisse : la carte garde son
          // apparence, le pouce gagne 12 px de chaque côté.
          "touch:after:absolute touch:after:-inset-1.5 touch:after:content-['']",
          isEditMode && !isDragging && "cursor-grab",
          isDragging && "cursor-grabbing",
          !isDragging && "hover:scale-110",
          isSelected && !isDragging && "scale-110 ring-2 ring-white ring-offset-1",
          isDragging && "scale-125 opacity-90 shadow-xl",
        )}
        style={{
          backgroundColor: pin.color || "transparent",
          border: pin.border_color
            ? `2px ${pin.border_style || "solid"} ${pin.border_color}`
            : "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
      >
        {pin.icon && (
          <LazyLucideIcon
            name={pin.icon}
            className="h-4 w-4"
            style={{ color: pin.icon_color || "#ffffff" }}
          />
        )}
      </button>

      {/* Un lieu qui ouvre une autre carte le dit : sans repère, personne ne
          va cliquer pour vérifier. */}
      {pin.target_map_id && !isDragging && (
        <span
          aria-hidden
          title={t("leadsToMap")}
          className="pointer-events-none absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background text-foreground shadow"
        >
          <Layers className="h-2.5 w-2.5" />
        </span>
      )}

      {/* Combien de monde il y a ici.
          Un compte, et non les têtes : la carte porte déjà le nom de chaque
          lieu, et une pile d'avatars par-dessus la rendait illisible. Qui est
          là précisément se lit dans la fiche, où la place ne manque pas. */}
      {presentCount > 0 && !isDragging && (
        <span
          aria-label={t("peopleHere", { count: presentCount })}
          className="pointer-events-none absolute left-full top-1/2 ml-1 flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold leading-none text-background ring-2 ring-background"
        >
          {presentCount}
        </span>
      )}

      {/* Le nom du lieu, en permanence.
          Il n'apparaissait qu'au survol : une carte de cinquante lieux ne se
          lisait qu'à la souris, un par un, et pas du tout au doigt.

          `aria-hidden` : le bouton porte déjà ce nom en `aria-label`, et le
          laisser ici le ferait annoncer deux fois. Et une largeur bornée, car
          rien n'oblige un lieu à porter un nom court — sans elle, « La
          citadelle des vents du nord » barrait la carte. */}
      {!isDragging && showLabel && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-full left-1/2 mt-1 max-w-40 -translate-x-1/2 truncate",
            "rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow-sm transition-colors",
            isSelected ? "bg-primary" : "bg-black/70 group-hover:bg-black/90 group-focus-within:bg-black/90",
          )}
        >
          {pin.title}
        </div>
      )}

      {/* Bouton supprimer — frère du marqueur, et non son enfant : un bouton
          dans un bouton est du HTML invalide, que les navigateurs défont en
          sortant l'un des deux de l'autre. */}
      {isEditMode && !isDragging && (
        <button
          type="button"
          aria-label={t("deletePin")}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(pin); }}
          className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex group-focus-within:flex focus-visible:flex"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
});
