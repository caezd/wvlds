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
};

const MobileSidebarContext = createContext<Ctx>({
  mobileSidebar: null,
  setMobileSidebar: () => {},
  drawerOpen: false,
  setDrawerOpen: () => {},
  hideMobileHeader: false,
  setHideMobileHeader: () => {},
});

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileSidebar, setMobileSidebar] = useState<React.ReactNode>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hideMobileHeader, setHideMobileHeader] = useState(false);
  return (
    <MobileSidebarContext.Provider
      value={{ mobileSidebar, setMobileSidebar, drawerOpen, setDrawerOpen, hideMobileHeader, setHideMobileHeader }}
    >
      {children}
    </MobileSidebarContext.Provider>
  );
}

export function useMobileSidebar() {
  return useContext(MobileSidebarContext);
}
