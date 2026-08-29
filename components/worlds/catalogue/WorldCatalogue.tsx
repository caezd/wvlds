"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Library, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
        <div className="shrink-0 border-b border-border-soft px-4 pt-3">
          <TabsList className="h-8 rounded-lg p-0.5">
            <TabsTrigger value="inventory" className="h-7 px-3 text-xs">{t("items")}</TabsTrigger>
            <TabsTrigger value="skills" className="h-7 px-3 text-xs">{t("skills")}</TabsTrigger>
            {faceclaimsEnabled && (
              <TabsTrigger value="faceclaims" className="h-7 px-3 text-xs">{t("faceclaims")}</TabsTrigger>
            )}
          </TabsList>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="inventory" className="mt-0">
            <CatalogueList type="inventory" worldId={worldId} canEdit={canEdit && editMode} />
          </TabsContent>
          {faceclaimsEnabled && (
            <TabsContent value="faceclaims" className="mt-0">
              <FaceclaimList worldId={worldId} />
            </TabsContent>
          )}
          <TabsContent value="skills" className="mt-0">
            <CatalogueList type="skills" worldId={worldId} canEdit={canEdit && editMode} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer: note when catalogue is not fully active */}
      {inactiveNote && (
        <div className="shrink-0 flex justify-end border-t border-border-soft px-4 py-2">
          <span className="text-xs text-muted-foreground/50">{inactiveNote}</span>
        </div>
      )}
    </div>
  );
}
