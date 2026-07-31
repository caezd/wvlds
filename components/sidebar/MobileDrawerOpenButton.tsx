"use client";

import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";

// Bouton d'ouverture du drawer mobile (rail + sidebar), à intégrer dans l'en-tête
// des vues qui ont leur propre header — évite la barre générique redondante de
// AppShell (cf. isChatRoute / hasWorldPanelHeader dans AppShell.tsx).
export function MobileDrawerOpenButton({
  className = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hoverCard",
  iconClassName = "h-5 w-5",
}: {
  className?: string;
  iconClassName?: string;
}) {
  const { setDrawerOpen } = useMobileSidebar();

  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label="Ouvrir le menu"
      className={cn("lg:hidden", className)}
    >
      <Menu className={iconClassName} />
    </button>
  );
}
