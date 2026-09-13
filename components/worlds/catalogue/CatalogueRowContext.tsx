"use client";

import { createContext, useContext } from "react";

import type { WorldCatalogCategory } from "@/types/worlds";

/**
 * Ce qu'une ligne du catalogue a besoin de savoir de la liste entière.
 *
 * Le menu d'une ligne propose « Déplacer vers… » : il lui faut les catégories
 * du catalogue, et la sélection multiple se coche ligne par ligne. Faire
 * descendre tout cela par les propriétés traverserait deux conteneurs qui n'en
 * font rien — CatalogueSections passe déjà une douzaine de rappels.
 */
export type CatalogueRowContextValue = {
  categories: WorldCatalogCategory[];
  /** Déplace un objet au bout d'une catégorie (`null` : sans catégorie). */
  onMoveItem: (itemId: string, categoryId: string | null) => void;
  selectedIds: ReadonlySet<string>;
  onToggleSelected: (itemId: string) => void;
};

const CatalogueRowContext = createContext<CatalogueRowContextValue | null>(null);

export const CatalogueRowProvider = CatalogueRowContext.Provider;

export function useCatalogueRow(): CatalogueRowContextValue {
  const value = useContext(CatalogueRowContext);
  if (!value) throw new Error("useCatalogueRow : hors d'un CatalogueRowProvider");
  return value;
}
