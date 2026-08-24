import { PageSpinner } from "@/components/ui/page-spinner";
import { MobileDrawerOpenButton } from "@/components/sidebar/MobileDrawerOpenButton";

// AppShell masque sa barre mobile générique sur `/c/*` (cf. `isChatRoute` dans
// AppShell.tsx), en anticipant le ChatroomHeader de la page — squelette
// nécessaire ici pour que le bouton menu reste accessible pendant le chargement.
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-header-height shrink-0 items-center p-2 touch:p-2.5 border-b border-border-soft">
        <MobileDrawerOpenButton
          className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground"
          iconClassName="h-4 w-4"
        />
      </header>
      <PageSpinner />
    </div>
  );
}
