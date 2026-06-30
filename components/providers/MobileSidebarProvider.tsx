"use client";

import { createContext, useContext, useState } from "react";

type Ctx = {
  mobileSidebar: React.ReactNode;
  setMobileSidebar: (node: React.ReactNode) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
};

const MobileSidebarContext = createContext<Ctx>({
  mobileSidebar: null,
  setMobileSidebar: () => {},
  drawerOpen: false,
  setDrawerOpen: () => {},
});

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileSidebar, setMobileSidebar] = useState<React.ReactNode>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <MobileSidebarContext.Provider value={{ mobileSidebar, setMobileSidebar, drawerOpen, setDrawerOpen }}>
      {children}
    </MobileSidebarContext.Provider>
  );
}

export function useMobileSidebar() {
  return useContext(MobileSidebarContext);
}
