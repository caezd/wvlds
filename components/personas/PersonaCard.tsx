"use client";

import { PersonaEditSheet } from "./PersonaEditSheet";
import type { PersonaSectionWithFields } from "@/types/personas";
import type { AvatarConfigV1 } from "./avatar/PersonaAvatarPicker";
import { Pencil } from "lucide-react";

type PersonaCardProps = {
  personaId: string;
  personaName: string;
  avatarUrl?: string | null;
  avatarConfig?: AvatarConfigV1 | null;
  bannerUrl?: string | null;
  initialFrameId?: string | null;
  initialFrameUrl?: string | null;
  initialSections: PersonaSectionWithFields[];
  worldId?: string;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "P";
}

export function PersonaCard({
  personaId,
  personaName,
  avatarUrl,
  avatarConfig,
  bannerUrl,
  initialFrameId,
  initialFrameUrl,
  initialSections,
  worldId,
  restrictInventory,
  restrictSkills,
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
      worldId={worldId}
      restrictInventory={restrictInventory}
      restrictSkills={restrictSkills}
      trigger={
        <button className="group relative w-full aspect-square rounded-2xl overflow-hidden bg-muted shadow-sm hover:shadow-lg transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {/* Image / fallback */}
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={personaName}
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-3xl font-bold text-muted-foreground select-none">
              {initials(personaName)}
            </div>
          )}

          {/* Gradient overlay + infos */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

          {/* Bouton éditer — coin supérieur droit au survol */}
          <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
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
