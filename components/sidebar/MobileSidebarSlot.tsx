"use client";

import { useEffect } from "react";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";

export function MobileSidebarSlot({ children }: { children: React.ReactNode }) {
  const { setMobileSidebar } = useMobileSidebar();

  useEffect(() => {
    setMobileSidebar(children);
    return () => setMobileSidebar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
