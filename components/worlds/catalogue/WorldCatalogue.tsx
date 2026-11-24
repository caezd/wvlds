"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Ban, Lock, LockOpen, Package, Pencil, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { getWorldCatalogUsage } from "@/app/actions/worldCatalog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";

// Le catalogue se lit en couches : `catalogueTypes` porte les types et le
// découpage en colonnes, `CataloguePieces` les briques d'une ligne,
// `CatalogueSections` les conteneurs, `CatalogueList` la mécanique de
// glisser-déposer. Ce fichier n'est plus que la coque d'une vue : Objets
// ou Compétences, chacune son lien dans la navigation du monde.
import { CatalogueList } from "./CatalogueList";
import { WikiLinkProvider } from "@/components/worlds/wiki/WikiLinkContext";
import { buttonVariants } from "@/components/ui/button";

/**
 * L'état d'un des deux catalogues, en un cadenas.
 *
 * Une ligne de texte le disait en pied de panneau — « Objets : saisie libre
 * (catalogue non restreint) · Compétences : … » — et elle disait le contraire
 * de ce qu'elle valait : elle prenait toute la largeur pour un réglage qu'on
 * consulte rarement, et ne paraissait justement PAS quand le catalogue était
 * restreint, l'état qui compte le plus.
 *
 * Le cadenas tient à côté du titre qu'il qualifie — c'est cette
 * proximité qui le rend lisible sans légende. Fermé : seules les entrées du
 * catalogue. Ouvert : chacun saisit ce qu'il veut dans sa fiche. Barré : la
 * fonctionnalité est éteinte pour ce monde. La phrase complète reste, au
 * survol.
 */
function CatalogLock({
  enabled,
  restricted,
  disabledLabel,
  freeLabel,
  restrictedLabel,
}: {
  enabled: boolean;
  restricted: boolean;
  disabledLabel: string;
  freeLabel: string;
  restrictedLabel: string;
}) {
  const label = !enabled ? disabledLabel : restricted ? restrictedLabel : freeLabel;
  const Icon = !enabled ? Ban : restricted ? Lock : LockOpen;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* `span` et non `button` : l'onglet est déjà le bouton, et un bouton
            dans un bouton n'est pas un HTML valide. `tabIndex` le rend tout de
            même atteignable au clavier, où le survol n'existe pas. */}
        <span
          tabIndex={0}
          role="img"
          aria-label={label}
          className="inline-flex shrink-0 items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Icon className={cn("h-3 w-3", !enabled && "opacity-50")} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-center">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ── WorldCatalogue ────────────────────────────────────────────────────────────

export type WorldCatalogueProps = {
  worldId: string;
  /** Objets (`?view=catalogue`) ou compétences (`?view=skills`) : deux vues du monde. */
  type: "inventory" | "skills";
  canEdit: boolean;
  /** La fonction est-elle activée pour ce monde ? */
  enabled: boolean;
  /** Seules les entrées du catalogue entrent dans les fiches. */
  restricted: boolean;
};

export function WorldCatalogue({ worldId, type, canEdit, enabled, restricted }: WorldCatalogueProps) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const [editMode, setEditMode] = useState(false);
  const items = type === "inventory";
  const Icon = items ? Package : Sparkles;

  /**
   * Le décompte d'usage : la RPC balaie le JSONB de toutes les fiches du
   * monde. `null` tant qu'on ne sait pas — aucun nombre ne s'affiche alors.
   */
  const [usage, setUsage] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getWorldCatalogUsage(worldId).then(res => {
      if (!cancelled && res.ok) setUsage(res.usage);
    });
    return () => { cancelled = true; };
  }, [worldId]);

  return (
    <WikiLinkProvider worldId={worldId}>
    <div className="flex h-full w-full flex-col">
      <WorldPanelHeader
        icon={<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={items ? t("items") : t("skills")}
        right={
          canEdit && (
            // Une bascule d'affichage : `outline`, enfoncée (aria-pressed) en mode édition.
            <button
              type="button"
              onClick={() => setEditMode(v => !v)}
              aria-pressed={editMode}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "text-xs",
              )}
            >
              <Pencil className="h-3 w-3" />
              {editMode ? t("editingActive") : tCommon("edit")}
            </button>
          )
        }
      >
        <span className="ml-1.5 text-muted-foreground">
          <CatalogLock
            enabled={enabled}
            restricted={restricted}
            disabledLabel={t(items ? "itemsDisabled" : "skillsDisabled")}
            freeLabel={t(items ? "itemsUnrestricted" : "skillsUnrestricted")}
            restrictedLabel={t(items ? "itemsRestricted" : "skillsRestricted")}
          />
        </span>
      </WorldPanelHeader>

      <div className="flex-1 overflow-y-auto p-4">
        <CatalogueList type={type} worldId={worldId} canEdit={canEdit && editMode} usage={usage} />
      </div>
    </div>
    </WikiLinkProvider>
  );
}
