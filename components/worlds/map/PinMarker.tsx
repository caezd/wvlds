"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Layers, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { type MapPersona, type MapPin as MapPinType } from "@/app/actions/worldMap";

/** Une même référence pour « personne » : la mémoïsation compare par identité. */
const NOBODY: MapPersona[] = [];
/** Au-delà, on compte au lieu d'empiler — trois têtes disent déjà « il y a du monde ». */
const AVATARS_SHOWN = 3;

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
  presentPersonas = NOBODY,
  onPinClick,
  onDelete,
  onMoved,
}: {
  pin: MapPinType;
  isSelected: boolean;
  isEditMode: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
  /** Les personas qui se trouvent ici — voir migration 154. */
  presentPersonas?: MapPersona[];
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
      className={cn("absolute group", isDragging ? "z-30" : "z-10")}
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

      {/* Qui est là. À droite du marqueur, hors de portée du pointeur : c'est
          le marqueur qu'on clique, les têtes ne font qu'annoncer. */}
      {presentPersonas.length > 0 && !isDragging && (
        <div
          role="group"
          aria-label={t("whoIsHere")}
          className="pointer-events-none absolute left-full top-1/2 ml-1 flex -translate-y-1/2 items-center -space-x-1.5"
        >
          {presentPersonas.slice(0, AVATARS_SHOWN).map((p) => (
            <span key={p.id} data-persona-id={p.id} title={p.name} className="rounded-full ring-1 ring-background">
              <AvatarWithFrame src={p.avatar_url} alt={p.name} fallback={p.name} size={18} frameUrl={p.frame?.asset_url} />
            </span>
          ))}
          {presentPersonas.length > AVATARS_SHOWN && (
            <span className="rounded-full bg-background px-1 text-[10px] font-medium text-foreground shadow">
              {t("morePersonas", { count: presentPersonas.length - AVATARS_SHOWN })}
            </span>
          )}
        </div>
      )}

      {/* Label au survol ou au focus clavier */}
      {!isDragging && (
        <div className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-2 py-0.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
