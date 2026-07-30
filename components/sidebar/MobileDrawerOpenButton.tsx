"use client";

import { Menu } from "lucide-react";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";

// Bouton d'ouverture du drawer mobile (rail + sidebar), à intégrer dans l'en-tête
// des vues qui ont leur propre header — évite la barre générique redondante de
// AppShell (cf. isChatRoute / hasWorldPanelHeader dans AppShell.tsx).
export function MobileDrawerOpenButton() {
  const { setDrawerOpen } = useMobileSidebar();

  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label="Ouvrir le menu"
      className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hoverCard"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
