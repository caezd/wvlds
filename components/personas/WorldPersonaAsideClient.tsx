"use client";

import { Plus, Users } from "lucide-react";
import { PersonaCard } from "./PersonaCard";
import { PersonaCreateSheet } from "./PersonaCreateSheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PersonaSectionWithFields } from "@/types/personas";
import type { AvatarConfigV1 } from "./avatar/PersonaAvatarPicker";

export type AsidePersona = {
  id: string;
  name: string | null;
  avatar_url?: string | null;
  avatar_config?: unknown;
  avatar_frame_id?: string | null;
  banner_url?: string | null;
  frame?: { asset_url?: string | null } | null;
  faceclaim?: string | null;
  sections: PersonaSectionWithFields[];
};

// Seuils de colonnes : 1 col < 190 px · 2 cols < 380 px · 3 cols ≥ 380 px
function getGridCols(width: number): number {
  if (width >= 380) return 3;
  if (width >= 190) return 2;
  return 1;
}

export function WorldPersonaAsideClient({
  worldId,
  personas,
  asideWidth = 192,
  restrictInventory = false,
  restrictSkills = false,
  faceclaimsEnabled,
}: {
  worldId: string;
  personas: AsidePersona[];
  asideWidth?: number;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  faceclaimsEnabled?: boolean;
}) {
  const cols = getGridCols(asideWidth);
  const sorted = [...personas].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", "fr", { sensitivity: "base" }),
  );

  return (
    <div className="flex h-full flex-col">
      {/* En-tête */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-soft px-3 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Personas
          {sorted.length > 0 && (
            <span className="ml-1.5 text-muted-foreground/60">{sorted.length}</span>
          )}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <PersonaCreateSheet
              worldId={worldId}
              restrictInventory={restrictInventory}
              restrictSkills={restrictSkills}
              trigger={
                <button
                  type="button"
                  aria-label="Nouveau persona"
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-border-soft text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              }
            />
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>Nouveau persona</TooltipContent>
        </Tooltip>
      </div>

      {/* Corps */}
      <div className="flex-1 overflow-y-auto p-2.5">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Users className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground/60 leading-snug px-1">
              Aucun persona<br />dans ce monde.
            </p>
          </div>
        ) : (
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {sorted.map((p) => (
              <PersonaCard
                key={p.id}
                personaId={p.id}
                personaName={p.name ?? "Sans nom"}
                avatarUrl={p.avatar_url}
                avatarConfig={p.avatar_config as AvatarConfigV1 | null}
                bannerUrl={p.banner_url}
                initialFrameId={p.avatar_frame_id ?? null}
                initialFrameUrl={
                  (p.frame as { asset_url?: string | null } | null)
                    ?.asset_url ?? null
                }
                initialFaceclaim={p.faceclaim ?? null}
                initialSections={p.sections}
                worldId={worldId}
                restrictInventory={restrictInventory}
                restrictSkills={restrictSkills}
                faceclaimsEnabled={faceclaimsEnabled}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
