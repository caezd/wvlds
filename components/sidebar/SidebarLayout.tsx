"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Logo from "@/components/logo";
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
}: {
  sidebar: React.ReactNode;
  rail: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  // Initialisé depuis le cookie lu côté serveur → SSR et client identiques, pas de flash
  const [open, setOpen] = useState(defaultOpen);

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

      {/* ── Aside — largeur animée ───────────────────────────── */}
      <aside
        className="relative z-20 h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out max-md:hidden"
        style={{ width: open ? "var(--sidebar-width, 260px)" : `${RAIL_WIDTH}px` }}
      >
        {/*
          Les deux vues sont TOUJOURS dans le DOM pour garder l'arbre
          de composants stable entre SSR et client (IDs Radix stables).
          CSS opacity + pointerEvents contrôlent la visibilité.
        */}

        {/* ── Mode étendu ───────────────────────────────────── */}
        <div
          aria-hidden={!open}
          className="absolute inset-0 flex flex-col transition-opacity duration-200"
          style={{
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            width: "var(--sidebar-width, 260px)",
          }}
        >
          <div className="h-full overflow-x-clip overflow-y-auto bg-token-bg-elevated-secondary">
            <nav className="relative flex h-full w-full flex-1 flex-col overflow-y-auto">
              <header className="sticky top-0 z-30 bg-token-bg-elevated-secondary">
                <div className="px-2">
                  <div className="h-header-height flex items-center justify-between">
                    <a
                      href="/"
                      aria-label="Accueil"
                      className="hover:bg-hover-400 flex h-9 w-9 items-center justify-center rounded-lg"
                    >
                      <Logo width={20} height={20} accent={undefined} />
                    </a>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={toggle}
                          aria-label="Réduire la barre latérale"
                          className="hover:bg-muted flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors"
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

        {/* ── Mode réduit (rail) ────────────────────────────── */}
        <div
          aria-hidden={open}
          className="absolute inset-0 flex flex-col items-center bg-token-bg-elevated-secondary transition-opacity duration-200"
          style={{
            opacity: open ? 0 : 1,
            pointerEvents: open ? "none" : "auto",
            width: `${RAIL_WIDTH}px`,
          }}
        >
          <div className="sticky top-0 z-10 pt-1.5 w-full flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  aria-label="Ouvrir la barre latérale"
                  className="hover:bg-muted flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors"
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

      {/* ── Contenu principal ───────────────────────────────── */}
      <section className="relative flex h-full max-w-full flex-1 flex-col p-1.5 pl-0">
        <main className="relative h-full w-full flex-1 overflow-auto rounded-[6px] bg-background border border-border-soft">
          <div id="thread" className="group/thread @container/thread h-full w-full">
            {children}
          </div>
        </main>
      </section>
    </div>
  );
}
