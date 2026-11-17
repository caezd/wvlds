"use client";

import { useSearchParams } from "next/navigation";
import { PageSpinner } from "@/components/ui/page-spinner";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { MobileDrawerOpenButton } from "@/components/sidebar/MobileDrawerOpenButton";

// Onglets secondaires d'un monde ayant leur propre WorldPanelHeader. Toute
// autre valeur de `view` — absente, inconnue, ou désignant une vue désactivée
// pour ce monde — retombe sur la page d'accueil et sa bannière.
const WORLD_PANEL_VIEWS = new Set([
  "members", "personas", "wiki", "canvas", "catalogue", "map", "timeline", "settings",
]);

// AppShell masque sa barre mobile générique sur tout `/w/` (cf. `isWorldRoute`
// dans AppShell.tsx), en anticipant le header propre de la page — mais ce
// header fait partie du contenu encore en chargement ici. Sans les squelettes
// ci-dessous, le bouton menu serait inaccessible pendant tout le chargement.
export default function Loading() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const hasWorldPanelHeader = !!view && WORLD_PANEL_VIEWS.has(view);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasWorldPanelHeader ? (
        <WorldPanelHeader />
      ) : (
        // Page d'accueil : mêmes position (haut du contenu, p-3) et style que
        // le bouton incrusté sur la bannière (cf. WorldHome.tsx) — le bouton
        // ne bouge donc pas d'un pixel quand le contenu réel prend la place du
        // squelette. `lg:hidden` sur l'enveloppe et pas seulement sur le
        // bouton : sans lui, ce bloc laisserait un vide de sa hauteur en
        // desktop, où le bouton n'est jamais rendu.
        <div className="flex shrink-0 items-center p-3 lg:hidden">
          <MobileDrawerOpenButton className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/45" />
        </div>
      )}
      <PageSpinner />
    </div>
  );
}
