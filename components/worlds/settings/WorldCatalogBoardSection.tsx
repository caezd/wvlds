"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Store } from "lucide-react";

import { getWorldCatalogUsage } from "@/app/actions/worldCatalog";
import { CatalogueList } from "@/components/worlds/catalogue/CatalogueList";
import { WikiLinkProvider } from "@/components/worlds/wiki/WikiLinkContext";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import type { CatalogType } from "@/components/worlds/catalogue/catalogueTypes";
import { TitleWithHelp } from "./FeatureLayout";

/**
 * Le tableau du catalogue d'un monde, dans ses réglages : les objets (onglet
 * Objets de Économie › Inventaire) ou les compétences (Personas ›
 * Compétences). Création, catégories, glisser-déposer et corbeille, toujours
 * en édition pour qui a `catalog.edit`.
 *
 * Une colonne par catégorie, chacune avec son bouton d'ajout. Le tableau
 * s'étire sur la hauteur restante (une chaîne de flex depuis la zone de
 * défilement des réglages, voir `data-fill-page`) : la page ne défile pas, le
 * tableau défile de côté et chaque colonne en hauteur.
 */
export function WorldCatalogBoardSection({ worldId, type }: { worldId: string; type: CatalogType }) {
  const t = useTranslations("worlds.settings.catalogBoard");
  const { can } = useWorldMembership();
  const { world_economy } = useFeatureFlags();

  // Combien de personas portent chaque entrée : `null` tant qu'on ne sait pas.
  const [usage, setUsage] = React.useState<Record<string, number> | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void getWorldCatalogUsage(worldId).then((res) => {
      if (!cancelled && res.ok) setUsage(res.usage);
    });
    return () => {
      cancelled = true;
    };
  }, [worldId]);

  return (
    <section aria-label={t(`${type}.title`)} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-sm text-muted-foreground">
          <TitleWithHelp title={t(`${type}.intro`)} help={t(`${type}.help`)} />
        </p>
        {/* Seuls les objets se vendent. */}
        {type === "inventory" && world_economy && (
          <Link
            href={`/w/${worldId}?view=settings&section=shops`}
            className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Store className="size-3.5" aria-hidden />
            {t("sellLink")}
          </Link>
        )}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="catalog-board">
        <WikiLinkProvider worldId={worldId}>
          <CatalogueList type={type} worldId={worldId} canEdit={can("catalog.edit")} usage={usage} fill />
        </WikiLinkProvider>
      </div>
    </section>
  );
}
