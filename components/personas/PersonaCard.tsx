"use client";

import { PersonaEditSheet } from "./PersonaEditSheet";
import type { PersonaSectionWithFields } from "@/types/personas";
import type { AvatarConfigV1 } from "./avatar/PersonaAvatarPicker";
import type { PersonaNarrativeStatus, PersonaReviewStatus, MaritalStatus } from "@/types/db";
import { cn } from "@/lib/utils";
import { isRetiredStatus } from "@/lib/personaStatus";
import { PersonaStatusBadge } from "./PersonaStatusBadge";
import { PersonaSheetBadge } from "./PersonaSheetBadge";
import { Pencil } from "lucide-react";
import { getInitials } from "@/lib/textFormatting";
import { StoredImage } from "@/components/ui/stored-image";
import { avatarThumbWidth } from "@/lib/storage";

type PersonaCardProps = {
  personaId: string;
  personaName: string;
  avatarUrl?: string | null;
  avatarConfig?: AvatarConfigV1 | null;
  bannerUrl?: string | null;
  initialFrameId?: string | null;
  initialFrameUrl?: string | null;
  initialFaceclaim?: string | null;
  initialMaritalStatus?: MaritalStatus | null;
  initialSpousePersonaId?: string | null;
  narrativeStatus?: PersonaNarrativeStatus | null;
  /** Validation de la fiche (migration 181) : badge sur la tuile, barre « Soumettre » dans l'éditeur. */
  reviewStatus?: PersonaReviewStatus | null;
  sheetComplete?: boolean | null;
  /** Ouvre l'éditeur dès le montage (lien `?persona=<id>` d'une notification). */
  openOnMount?: boolean;
  initialSections: PersonaSectionWithFields[];
  worldId?: string;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  faceclaimsEnabled?: boolean;
};

export function PersonaCard({
  personaId,
  personaName,
  avatarUrl,
  avatarConfig,
  bannerUrl,
  initialFrameId,
  initialFrameUrl,
  initialFaceclaim,
  initialMaritalStatus,
  initialSpousePersonaId,
  narrativeStatus,
  reviewStatus,
  sheetComplete,
  openOnMount,
  initialSections,
  worldId,
  restrictInventory,
  restrictSkills,
  faceclaimsEnabled,
}: PersonaCardProps) {
  return (
    <PersonaEditSheet
      personaId={personaId}
      personaName={personaName}
      initialSections={initialSections}
      initialAvatarUrl={avatarUrl ?? null}
      initialAvatarConfig={avatarConfig ?? null}
      initialBannerUrl={bannerUrl ?? null}
      initialFrameId={initialFrameId ?? null}
      initialFrameUrl={initialFrameUrl ?? null}
      initialFaceclaim={initialFaceclaim ?? null}
      initialMaritalStatus={initialMaritalStatus ?? null}
      initialSpousePersonaId={initialSpousePersonaId ?? null}
      initialNarrativeStatus={narrativeStatus ?? null}
      initialReviewStatus={reviewStatus ?? null}
      openOnMount={openOnMount}
      worldId={worldId}
      restrictInventory={restrictInventory}
      restrictSkills={restrictSkills}
      faceclaimsEnabled={faceclaimsEnabled}
      trigger={
        <button
          data-narrative-status={narrativeStatus ?? "alive"}
          className="group relative w-full aspect-square rounded-lg overflow-hidden bg-muted shadow-sm hover:shadow-lg transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* Image / fallback — grisée quand le persona a quitté la scène. */}
          {avatarUrl ? (
            <StoredImage
              url={avatarUrl}
              width={avatarThumbWidth(200)}
              alt={personaName}
              className={cn("object-cover", isRetiredStatus(narrativeStatus) && "grayscale opacity-80")}
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-3xl font-bold text-muted-foreground select-none">
              {getInitials(personaName, "P")}
            </div>
          )}

          {/* Gradient overlay + infos */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

          <div className="absolute left-3 top-3 flex flex-col items-start gap-1">
            <PersonaStatusBadge status={narrativeStatus} />
            <PersonaSheetBadge persona={{ review_status: reviewStatus, sheet_complete: sheetComplete }} className="bg-black/60 text-white dark:text-white" />
          </div>

          {/* Bouton éditer — coin supérieur droit au survol */}
          <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <Pencil className="h-3 w-3" />
            Éditer
          </span>

          {/* Nom */}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <span className="text-sm font-semibold text-white leading-tight line-clamp-2 text-left">
              {personaName}
            </span>
          </div>
        </button>
      }
    />
  );
}
