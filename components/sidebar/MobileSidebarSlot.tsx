"use client";

import { useEffect } from "react";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";

export function MobileSidebarSlot({ children }: { children: React.ReactNode }) {
  const { setMobileSidebar } = useMobileSidebar();

  // Met à jour le contenu injecté à chaque changement (ex: un router.refresh()
  // recharge WorldSidebar avec de nouveaux props) — sinon le drawer mobile
  // garderait une navigation de monde périmée.
  useEffect(() => {
    setMobileSidebar(children);
  }, [children, setMobileSidebar]);

  // Nettoie uniquement au démontage (pas entre deux mises à jour, pour éviter
  // un flash de contenu vide).
  useEffect(() => {
    return () => setMobileSidebar(null);
  }, [setMobileSidebar]);

  return null;
}
