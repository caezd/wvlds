"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";

import { PersonaCard } from "@/components/personas/PersonaCard";
import { PersonaProfileSheetTrigger } from "@/components/personas/PersonaProfileSheetTrigger";
import { PersonaNpcBadge } from "@/components/personas/PersonaNpcBadge";
import { PersonaStatusBadge } from "@/components/personas/PersonaStatusBadge";
import { PersonaSheetBadge } from "@/components/personas/PersonaSheetBadge";
import { PersonaShelfTile, SHELF_TILE_CLASS } from "@/components/personas/shelves/PersonaShelfTile";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import type { PersonaSectionWithFields } from "@/types/personas";
import { StoredImage } from "@/components/ui/stored-image";
import { avatarThumbWidth } from "@/lib/storage";
import { getInitials } from "@/lib/textFormatting";
import { isRetiredStatus } from "@/lib/personaStatus";
import { cn } from "@/lib/utils";
import { neutralAvatarBackground } from "./neutralAvatar";
import type { CommunityPersona } from "./useCommunityData";

/** Les badges posés sur le portrait, fond sombre pour rester lisibles sur l'image. */
const TILE_BADGE_CLASS = "bg-black/60 text-white";
/** Dans l'étagère : pastille sombre, libellé clair et tronqué. */
const SHELF_BADGE_CLASS = "h-5 max-w-full bg-black/80 px-1.5 py-0 text-2xs font-semibold text-white";

/** Le bouton de la tuile d'étagère : le portrait seul, sans cadre autour. */
const SHELF_ITEM_CLASS =
  "group block w-full min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * La tuile de la vue « Joueurs » : l'image carrée, les badges en haut, le nom
 * et le groupe posés en bas sur un léger dégradé. Un persona hors jeu se grise en entier.
 */
function ShelfItem({
  name,
  persona,
  line2,
  groupColor,
  badges,
  corner,
}: {
  name: string;
  persona: CommunityPersona;
  line2?: string | null;
  groupColor?: string;
  badges: ReactNode;
  corner?: ReactNode;
}) {
  const retired = isRetiredStatus(persona.narrative_status);
  return (
    <>
      <span className="relative block aspect-square w-full overflow-hidden rounded-lg shadow-sm transition-shadow group-hover:shadow-lg">
        <span
          data-narrative-status={persona.narrative_status}
          className={cn("absolute inset-0 transition-transform duration-300 group-hover:scale-[1.03]", retired && "grayscale opacity-80")}
          style={persona.avatar_url ? undefined : { backgroundImage: neutralAvatarBackground(name) }}
        >
          {persona.avatar_url ? (
            <StoredImage url={persona.avatar_url} width={avatarThumbWidth(160)} alt={name} className="object-cover" draggable={false} />
          ) : (
            <span className="absolute inset-0 grid place-items-center pb-6 text-3xl font-bold text-white/50 select-none">{getInitials(name, "P")}</span>
          )}
        </span>
        {/* Un léger dégradé en bas, juste assez pour lire le nom sur l'image. */}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/75 to-transparent" />
        <span className="absolute left-2 top-2 flex max-w-[calc(100%-16px)] flex-col items-start gap-1">{badges}</span>
        {corner}
        <span className="absolute inset-x-0 bottom-0 flex min-w-0 flex-col gap-0.5 p-2.5">
          <span className={cn("truncate text-sm font-semibold", retired ? "text-white/70" : "text-white")}>{name}</span>
          {line2 && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-white/75">
              {groupColor && <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-xs" style={{ backgroundColor: groupColor }} />}
              <span className="truncate">{line2}</span>
            </span>
          )}
        </span>
      </span>
    </>
  );
}

/**
 * La tuile d'un persona sur la page des membres. Mes personas et les PNJ que je
 * gère ouvrent l'éditeur ; les autres, la fiche en lecture. Les tiroirs sont
 * ceux de la page des personas, inchangés : seule la tuile qui les ouvre est d'ici.
 */
export function CommunityPersonaTile({
  persona,
  mine,
  npcSections,
  canManageNpc,
  variant = "wall",
  line2,
  lineSwatch,
  groupColor,
  featured,
  openOnMount,
  reviewActive,
  worldId,
  restrictInventory,
  restrictSkills,
  faceclaimsEnabled,
}: {
  persona: CommunityPersona;
  /** Ma version du persona, avec ses sections (chargée par la page serveur). */
  mine?: AsidePersona;
  npcSections?: PersonaSectionWithFields[];
  canManageNpc: boolean;
  /** `shelf` : le nom sous l'image (vue « Joueurs ») ; `wall` : sur l'image (vues des personas). */
  variant?: "shelf" | "wall";
  line2?: string | null;
  lineSwatch?: boolean;
  groupColor?: string;
  featured?: boolean;
  openOnMount?: boolean;
  reviewActive: boolean;
  worldId: string;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  faceclaimsEnabled?: boolean;
}) {
  const t = useTranslations("personas.list");
  const tCommon = useTranslations("common");
  const name = persona.name ?? t("unnamed");
  const badgeClass = variant === "shelf" ? SHELF_BADGE_CLASS : TILE_BADGE_CLASS;
  const badges = (
    <>
      <PersonaNpcBadge isNpc={persona.is_npc} className={badgeClass} />
      <PersonaStatusBadge status={persona.narrative_status} className={badgeClass} />
      <PersonaSheetBadge persona={persona} reviewActive={reviewActive} className={badgeClass} />
    </>
  );
  const triggerClass = variant === "shelf" ? SHELF_ITEM_CLASS : SHELF_TILE_CLASS;
  const tile = (corner?: ReactNode) => variant === "shelf" ? (
    <ShelfItem name={name} persona={persona} line2={line2} groupColor={lineSwatch ? groupColor : undefined} badges={badges} corner={corner} />
  ) : (
    <PersonaShelfTile
      name={name}
      avatarUrl={persona.avatar_url}
      narrativeStatus={persona.narrative_status}
      groupColor={groupColor}
      line2={line2}
      lineSwatch={lineSwatch}
      featured={featured}
      badges={badges}
      corner={corner}
    />
  );

  const editable = !!mine || (persona.is_npc && canManageNpc);
  if (!editable) {
    return (
      <PersonaProfileSheetTrigger
        personaId={persona.id}
        userId={persona.user_id}
        label={name}
        openOnMount={openOnMount}
        triggerClassName={triggerClass}
      >
        {tile()}
      </PersonaProfileSheetTrigger>
    );
  }

  const source = mine ?? persona;
  return (
    <PersonaCard
      personaId={persona.id}
      personaName={name}
      avatarUrl={source.avatar_url}
      avatarConfig={source.avatar_config as never}
      bannerUrl={source.banner_url}
      initialFrameId={source.avatar_frame_id}
      initialFrameUrl={source.frame?.asset_url}
      initialFaceclaim={source.faceclaim ?? null}
      initialMaritalStatus={source.marital_status ?? null}
      initialSpousePersonaId={source.spouse_persona_id ?? null}
      narrativeStatus={persona.narrative_status}
      reviewStatus={persona.review_status}
      sheetComplete={persona.sheet_complete}
      reviewActive={reviewActive}
      isNpc={persona.is_npc}
      openOnMount={openOnMount}
      initialSections={mine?.sections ?? npcSections ?? []}
      worldId={worldId}
      restrictInventory={restrictInventory}
      restrictSkills={restrictSkills}
      faceclaimsEnabled={faceclaimsEnabled}
      trigger={
        <button type="button" aria-label={name} className={triggerClass}>
          {tile(
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs-plus font-medium text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Pencil className="h-3 w-3" aria-hidden />
              {tCommon("edit")}
            </span>,
          )}
        </button>
      }
    />
  );
}
