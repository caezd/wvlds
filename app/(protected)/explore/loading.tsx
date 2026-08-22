import { PageSpinner } from "@/components/ui/page-spinner";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";

// AppShell masque sa barre mobile générique sur `/explore` (cf. `isExploreRoute`
// dans AppShell.tsx), en anticipant le WorldPanelHeader de la page — squelette
// nécessaire ici pour que le bouton menu reste accessible pendant le chargement.
export default function Loading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WorldPanelHeader />
      <PageSpinner />
    </div>
  );
}
