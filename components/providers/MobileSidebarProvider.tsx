"use client";

import { createContext, useContext, useState } from "react";

type Ctx = {
  mobileSidebar: React.ReactNode;
  setMobileSidebar: (node: React.ReactNode) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  // Permet à une vue avec son propre bouton menu intégré (ex: bannière de
  // monde en plein écran) de masquer la barre mobile générique de AppShell.
  hideMobileHeader: boolean;
  setHideMobileHeader: (hide: boolean) => void;
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
  hideMobileHeader: false,
  setHideMobileHeader: () => {},
  activeWorldId: null,
  setActiveWorldId: () => {},
});

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileSidebar, setMobileSidebar] = useState<React.ReactNode>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hideMobileHeader, setHideMobileHeader] = useState(false);
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
  return (
    <MobileSidebarContext.Provider
      value={{
        mobileSidebar, setMobileSidebar,
        drawerOpen, setDrawerOpen,
        hideMobileHeader, setHideMobileHeader,
        activeWorldId, setActiveWorldId,
      }}
    >
      {children}
    </MobileSidebarContext.Provider>
  );
}

export function useMobileSidebar() {
  return useContext(MobileSidebarContext);
}
