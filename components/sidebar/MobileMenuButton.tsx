"use client";

import { X } from "lucide-react";
import Logo from "@/components/logo";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";

export function MobileMenuButton() {
  const { setDrawerOpen } = useMobileSidebar();

  return (
    <>
      {/* Mobile : ferme le drawer */}
      <button
        type="button"
        onClick={() => setDrawerOpen(false)}
        aria-label="Fermer le menu"
        className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Desktop : logo */}
      <div className="hidden lg:flex items-center justify-center w-9 h-9">
        <Logo className="size-6" accent="var(--accent)" />
      </div>
    </>
  );
}
