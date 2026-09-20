"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Ban, Library, Lock, LockOpen, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import { getWorldCatalogUsage } from "@/app/actions/worldCatalog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar, TabBarTrigger } from "@/components/ui/tab-bar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";

// Le catalogue se lit en couches : `catalogueTypes` porte les types et le
// découpage en colonnes, `CataloguePieces` les briques d'une ligne,
// `CatalogueSections` les conteneurs, `CatalogueList` la mécanique de
// glisser-déposer. Ce fichier n'est plus que la coque à onglets.
import { CatalogueList } from "./CatalogueList";
import { WikiLinkProvider } from "@/components/worlds/wiki/WikiLinkContext";
import { FaceclaimList } from "./FaceclaimList";

/**
 * L'état d'un des deux catalogues, en un cadenas.
 *
 * Une ligne de texte le disait en pied de panneau — « Objets : saisie libre
 * (catalogue non restreint) · Compétences : … » — et elle disait le contraire
 * de ce qu'elle valait : elle prenait toute la largeur pour un réglage qu'on
 * consulte rarement, et ne paraissait justement PAS quand le catalogue était
 * restreint, l'état qui compte le plus.
 *
 * Le cadenas tient dans l'onglet, à côté du mot qu'il qualifie — c'est cette
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
  canEdit: boolean;
  inventoryEnabled: boolean;
  inventoryRestricted: boolean;
  skillsEnabled: boolean;
  skillsRestricted: boolean;
  faceclaimsEnabled: boolean;
};

export function WorldCatalogue({ worldId, canEdit, inventoryEnabled, inventoryRestricted, skillsEnabled, skillsRestricted, faceclaimsEnabled }: WorldCatalogueProps) {
  const t = useTranslations("catalogue");
  const tCommon = useTranslations("common");
  const [editMode, setEditMode] = useState(false);
  const defaultTab = inventoryEnabled ? "inventory" : "skills";

  /**
   * Le décompte d'usage, chargé ici et non dans chaque onglet.
   *
   * Les deux listes sont montées ensemble (les onglets gardent leur contenu) :
   * une par onglet aurait appelé deux fois la même RPC, qui ne distingue pas
   * les objets des compétences et balaie le JSONB de toutes les fiches du
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
        icon={<Library className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("title")}
        right={
          canEdit && (
            <button
              type="button"
              onClick={() => setEditMode(v => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                editMode
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border-soft bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Pencil className="h-3 w-3" />
              {editMode ? t("editingActive") : tCommon("edit")}
            </button>
          )
        }
      />

      {/* Body — always show both tabs for editors */}
      <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
        {/* Onglets en soulignement, comme les fiches de persona et les
            paramètres d'un monde — la pastille pleine était le seul reste du
            style par défaut dans un panneau de monde. `TabBar` porte déjà sa
            ligne de base : le conteneur n'a plus de bordure à ajouter, et la
            liste s'aligne sur le retrait du corps (p-4) plutôt que sur son
            px-6 par défaut. */}
        <div className="shrink-0">
          <TabBar listClassName="px-4">
            <TabBarTrigger value="inventory" className="flex items-center gap-1.5">
              {t("items")}
              <CatalogLock
                enabled={inventoryEnabled}
                restricted={inventoryRestricted}
                disabledLabel={t("itemsDisabled")}
                freeLabel={t("itemsUnrestricted")}
                restrictedLabel={t("itemsRestricted")}
              />
            </TabBarTrigger>
            <TabBarTrigger value="skills" className="flex items-center gap-1.5">
              {t("skills")}
              <CatalogLock
                enabled={skillsEnabled}
                restricted={skillsRestricted}
                disabledLabel={t("skillsDisabled")}
                freeLabel={t("skillsUnrestricted")}
                restrictedLabel={t("skillsRestricted")}
              />
            </TabBarTrigger>
            {faceclaimsEnabled && (
              <TabBarTrigger value="faceclaims">{t("faceclaims")}</TabBarTrigger>
            )}
          </TabBar>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="inventory" className="mt-0">
            <CatalogueList type="inventory" worldId={worldId} canEdit={canEdit && editMode} usage={usage} />
          </TabsContent>
          {faceclaimsEnabled && (
            <TabsContent value="faceclaims" className="mt-0">
              <FaceclaimList worldId={worldId} />
            </TabsContent>
          )}
          <TabsContent value="skills" className="mt-0">
            <CatalogueList type="skills" worldId={worldId} canEdit={canEdit && editMode} usage={usage} />
          </TabsContent>
        </div>
      </Tabs>

    </div>
    </WikiLinkProvider>
  );
}
