"use client";

import { createContext, useContext, useMemo, useState } from "react";

type Ctx = {
  mobileSidebar: React.ReactNode;
  setMobileSidebar: (node: React.ReactNode) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  // Monde affiché par la page courante quand il n'est pas dérivable du
  // pathname (ex: `/c/[id]`, où l'id du monde parent n'est connu que côté
  // client) — alimente le surlignage actif de WorldsRail.
  activeWorldId: string | null;
  setActiveWorldId: (id: string | null) => void;
};

const MobileSidebarContext = createContext<Ctx>({
  mobileSidebar: null,
  setMobileSidebar: () => {},
  drawerOpen: false,
  setDrawerOpen: () => {},
  activeWorldId: null,
  setActiveWorldId: () => {},
});

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileSidebar, setMobileSidebar] = useState<React.ReactNode>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);

  // Sans `useMemo`, l'objet est recréé à chaque rendu du provider : tout rendu
  // du parent invalidait le contexte et réveillait ses consommateurs, même
  // quand aucune de ces trois valeurs n'avait bougé. Les setters de `useState`
  // sont déjà stables, seuls les états comptent en dépendances.
  const value = useMemo<Ctx>(
    () => ({
      mobileSidebar, setMobileSidebar,
      drawerOpen, setDrawerOpen,
      activeWorldId, setActiveWorldId,
    }),
    [mobileSidebar, drawerOpen, activeWorldId],
  );

  return (
    <MobileSidebarContext.Provider value={value}>
      {children}
    </MobileSidebarContext.Provider>
  );
}

export function useMobileSidebar() {
  return useContext(MobileSidebarContext);
}
