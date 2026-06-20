"use client";

import { createContext, useContext } from "react";

export const NotifPanelCtx = createContext<{
  open: boolean;
  toggle: () => void;
  close: () => void;
}>({ open: false, toggle: () => {}, close: () => {} });

export function useNotifPanel() {
  return useContext(NotifPanelCtx);
}
