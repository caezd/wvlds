import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/textFormatting";
import { isRetiredStatus } from "@/lib/personaStatus";
import { avatarThumbWidth } from "@/lib/storage";
import { StoredImage } from "@/components/ui/stored-image";
import type { PersonaNarrativeStatus } from "@/types/db";

/** Le bouton qui porte la tuile : c'est lui qui ouvre la fiche (ou l'éditeur). */
export const SHELF_TILE_CLASS =
  "group block w-full min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Une tuile d'étagère : le portrait carré, badges en haut, nom et ligne de
 * contexte (précédée de la couleur du groupe) posés en bas sur un dégradé. Visuel pur : le
 * bouton qui l'enveloppe vient de `PersonaCard` ou de la fiche en lecture.
 */
export function PersonaShelfTile({
  name,
  avatarUrl,
  narrativeStatus,
  groupColor,
  line2,
  lineSwatch = true,
  featured = false,
  badges,
  corner,
}: {
  name: string;
  avatarUrl: string | null | undefined;
  narrativeStatus: PersonaNarrativeStatus | null | undefined;
  groupColor?: string | null;
  /** Nom du groupe (par joueur) ou « @joueur » / « PNJ » (par groupe, liste). */
  line2?: string | null;
  /** Le carré de couleur du groupe devant la ligne 2 — seulement quand elle nomme le groupe. */
  lineSwatch?: boolean;
  /** Tuile en vedette (deux colonnes sur deux, vue par groupe) : nom et initiales plus grands. */
  featured?: boolean;
  badges?: ReactNode;
  /** Coin supérieur droit au survol (« Éditer »). */
  corner?: ReactNode;
}) {
  const retired = isRetiredStatus(narrativeStatus);
  return (
    <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted shadow-sm transition-shadow group-hover:shadow-lg">
      {/* Le portrait entier — image ou fond teinté du groupe — se grise quand le persona a quitté la scène. */}
      <span
        data-narrative-status={narrativeStatus ?? "alive"}
        // Au survol, le portrait s'avance à peine.
        className={cn("absolute inset-0 transition-transform duration-300 group-hover:scale-[1.03]", retired && "grayscale opacity-60")}
        style={!avatarUrl && groupColor ? { backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${groupColor} 28%, transparent), transparent 75%)` } : undefined}
      >
        {avatarUrl ? (
          <StoredImage url={avatarUrl} width={avatarThumbWidth(160)} alt={name} className="object-cover" draggable={false} />
        ) : (
          <span className={cn("absolute inset-0 grid place-items-center pb-6 font-bold text-muted-foreground select-none", featured ? "text-5xl" : "text-3xl")}>
            {getInitials(name, "P")}
          </span>
        )}
      </span>
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <span className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1">{badges}</span>
      {corner}
      <span className="absolute inset-x-0 bottom-0 flex min-w-0 flex-col gap-0.5 p-2.5">
        <span className={cn("line-clamp-2 font-semibold leading-tight", featured ? "text-lg" : "text-sm", retired ? "text-white/70" : "text-white")}>{name}</span>
        {line2 && (
          <span className="flex min-w-0 items-center gap-1.5 text-xs-plus text-white/70">
            {lineSwatch && groupColor && <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-xs" style={{ backgroundColor: groupColor }} />}
            <span className="truncate">{line2}</span>
          </span>
        )}
      </span>
    </span>
  );
}
