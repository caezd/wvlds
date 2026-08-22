"use client";

import { useSearchParams } from "next/navigation";
import { PageSpinner } from "@/components/ui/page-spinner";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { WORLD_PANEL_VIEWS } from "@/components/sidebar/AppShell";

// AppShell masque sa barre mobile générique dès que l'URL cible un onglet à
// header propre (cf. `hasWorldPanelHeader` dans AppShell.tsx) — mais ce
// header propre fait partie du contenu encore en chargement ici. Sans ce
// squelette, le bouton menu serait inaccessible pendant tout le chargement.
export default function Loading() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const hasWorldPanelHeader = !!view && WORLD_PANEL_VIEWS.has(view);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasWorldPanelHeader && <WorldPanelHeader />}
      <PageSpinner />
    </div>
  );
}
