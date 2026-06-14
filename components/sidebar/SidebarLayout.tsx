"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import Logo from "@/components/logo";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const RAIL_WIDTH = 56; // px

export default function SidebarLayout({
  sidebar,
  rail,
  children,
  defaultOpen = true,
  headerUserMenu = null,
}: {
  sidebar: React.ReactNode;
  rail: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  headerUserMenu?: React.ReactNode;
}) {
  // Initialisé depuis le cookie lu côté serveur → SSR et client identiques, pas de flash
  const [open, setOpen] = useState(defaultOpen);
  // Page monde (/w/[id]) : main devient transparent pour laisser les panneaux
  // centre/droite occuper tout l'espace comme des cartes plein écran.
  const pathname = usePathname();
  const isWorld = pathname?.startsWith("/w/") ?? false;
  const isChat = pathname?.startsWith("/c/") ?? false;
  // Tiroir mobile/tablette (< lg) — la sidebar devient un header + drawer
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      // Cookie lu par le layout serveur au prochain chargement de page
      document.cookie = `sidebar_open=${next}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  }

  return (
    <div className="relative flex h-full w-full flex-row">

      {/* -- Aside — largeur animée ----------------------------- */}
      <aside
        className="relative z-20 h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out max-lg:hidden"
        style={{ width: open ? "var(--sidebar-width, 260px)" : `${RAIL_WIDTH}px` }}
      >
        {/*
          Les deux vues sont TOUJOURS dans le DOM pour garder l'arbre
          de composants stable entre SSR et client (IDs Radix stables).
          CSS opacity + pointerEvents contrôlent la visibilité.
        */}

        {/* -- Mode étendu ------------------------------------- */}
        <div
          aria-hidden={!open}
          className="absolute inset-0 flex flex-col transition-opacity duration-200"
          style={{
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            width: "var(--sidebar-width, 260px)",
          }}
        >
          <div className="flex h-full flex-col overflow-hidden">
            <nav className="relative flex h-full w-full flex-1 flex-col overflow-hidden py-4">
              <header className="shrink-0">
                <div className="px-2">
                  <div className="h-header-height flex items-center justify-between">
                    <Link
                      href="/"
                      aria-label="Accueil"
                      className="hover:bg-hover-400 flex h-9 w-9 items-center justify-center rounded-full"
                    >
                      <Logo width={20} height={20} accent="var(--color-accent)" />
                    </Link>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={toggle}
                          aria-label="Réduire la barre latérale"
                          className="hover:bg-muted flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors"
                        >
                          <PanelLeftClose size={18} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8}>
                        Réduire
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </header>
              {sidebar}
            </nav>
          </div>
        </div>

        {/* -- Mode réduit (rail) ------------------------------ */}
        <div
          aria-hidden={open}
          className="absolute inset-0 flex flex-col items-center transition-opacity duration-200 py-4"
          style={{
            opacity: open ? 0 : 1,
            pointerEvents: open ? "none" : "auto",
            width: `${RAIL_WIDTH}px`,
          }}
        >
          <div className="sticky top-0 z-10 pt-1.5 w-full flex flex-col items-center gap-1">
            <Link
              href="/"
              aria-label="Accueil"
              className="hover:bg-hover-400 flex h-9 w-9 items-center justify-center rounded-full"
            >
              <Logo width={20} height={20} accent="var(--color-accent)" />
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  aria-label="Ouvrir la barre latérale"
                  className="hover:bg-muted flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors"
                >
                  <PanelLeftOpen size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Ouvrir
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-col items-center flex-1 w-full overflow-hidden px-1.5 pb-1.5">
            {rail}
          </div>
        </div>
      </aside>

      {/* -- Tiroir mobile/tablette (< lg) --------------------- */}
      <div
        className={cn(
          "lg:hidden fixed inset-0 z-50",
          !mobileOpen && "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        {/* Backdrop */}
        <div
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity duration-300",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />
        {/* Panneau coulissant */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex w-[var(--sidebar-width,260px)] flex-col bg-sidebar transition-transform duration-300 ease-in-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <header className="shrink-0 px-2">
            <div className="h-header-height flex items-center justify-between">
              <Link
                href="/"
                aria-label="Accueil"
                className="hover:bg-hover-400 flex h-9 w-9 items-center justify-center rounded-full"
              >
                <Logo width={20} height={20} accent="var(--color-accent)" />
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Fermer le menu"
                className="hover:bg-muted flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors"
              >
                <PanelLeftClose size={18} />
              </button>
            </div>
          </header>
          <nav className="relative flex w-full flex-1 flex-col overflow-hidden">
            {sidebar}
          </nav>
        </div>
      </div>

      {/* -- Contenu principal — panneau flottant arrondi ------ */}
      <section className="relative flex h-full max-w-full flex-1 flex-col py-3 pr-3 pl-0 max-lg:p-2 max-lg:pt-0">
        {/* Header mobile/tablette — remplace la sidebar (< lg) */}
        <header className="lg:hidden flex h-12 shrink-0 items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            className="bg-card-400 hover:bg-hover-400 flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors"
          >
            <PanelLeftOpen size={18} />
          </button>
          {headerUserMenu}
        </header>
        <main
          className={cn(
            "relative h-full w-full flex-1 max-lg:mt-2",
            isWorld || isChat
              ? "overflow-hidden"
              : "overflow-auto rounded-2xl bg-background border border-border-soft",
          )}
        >
          <div id="thread" className="group/thread @container/thread h-full w-full">
            {children}
          </div>
        </main>
      </section>
    </div>
  );
}
