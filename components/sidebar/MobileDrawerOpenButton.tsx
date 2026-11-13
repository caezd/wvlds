"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";

// Bouton d'ouverture du drawer mobile (rail + sidebar), à intégrer dans l'en-tête
// des vues qui ont leur propre header — évite la barre générique redondante de
// AppShell (cf. isChatRoute / hasWorldPanelHeader dans AppShell.tsx).
export function MobileDrawerOpenButton({
  className = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0"),
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
