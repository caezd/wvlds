"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Library, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import { getWorldCatalogUsage } from "@/app/actions/worldCatalog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar, TabBarTrigger } from "@/components/ui/tab-bar";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";

// Le catalogue se lit en couches : `catalogueTypes` porte les types et le
// découpage en colonnes, `CataloguePieces` les briques d'une ligne,
// `CatalogueSections` les conteneurs, `CatalogueList` la mécanique de
// glisser-déposer. Ce fichier n'est plus que la coque à onglets.
import { CatalogueList } from "./CatalogueList";
import { FaceclaimList } from "./FaceclaimList";

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

  const inactiveLines: string[] = [];
  if (!inventoryEnabled) inactiveLines.push(t("itemsDisabled"));
  else if (!inventoryRestricted) inactiveLines.push(t("itemsUnrestricted"));
  if (!skillsEnabled) inactiveLines.push(t("skillsDisabled"));
  else if (!skillsRestricted) inactiveLines.push(t("skillsUnrestricted"));
  const inactiveNote = inactiveLines.length > 0 ? inactiveLines.join(" · ") : null;

  return (
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
            <TabBarTrigger value="inventory">{t("items")}</TabBarTrigger>
            <TabBarTrigger value="skills">{t("skills")}</TabBarTrigger>
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

      {/* Footer: note when catalogue is not fully active */}
      {inactiveNote && (
        <div className="shrink-0 flex justify-end border-t border-border-soft px-4 py-2">
          <span className="text-xs text-muted-foreground">{inactiveNote}</span>
        </div>
      )}
    </div>
  );
}
