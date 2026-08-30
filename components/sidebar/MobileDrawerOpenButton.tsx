"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";

// Bouton d'ouverture du drawer mobile (rail + sidebar), à intégrer dans l'en-tête
// des vues qui ont leur propre header — évite la barre générique redondante de
// AppShell (cf. isChatRoute / hasWorldPanelHeader dans AppShell.tsx).
export function MobileDrawerOpenButton({
  className = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground",
  iconClassName = "h-4 w-4",
}: {
  className?: string;
  iconClassName?: string;
}) {
  const tCommon = useTranslations("common");
  const { setDrawerOpen } = useMobileSidebar();

  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label={tCommon("openMenu")}
      className={cn("lg:hidden", className)}
    >
      <Menu className={iconClassName} />
    </button>
  );
}
