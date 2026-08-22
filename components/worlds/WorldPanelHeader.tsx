"use client";

import type { ReactNode } from "react";
import { MobileDrawerOpenButton } from "@/components/sidebar/MobileDrawerOpenButton";

/**
 * Header commun aux onglets secondaires d'un monde (membres, personas, wiki,
 * catalogue, carte, chronologie, relations, paramètres) — même hauteur,
 * padding et bouton menu mobile partout ; le contenu varie par slots.
 */
export function WorldPanelHeader({
  icon,
  title,
  children,
  right,
}: {
  /** Icône en tête (déjà stylée, ex: `<Users className="h-4 w-4 shrink-0 text-muted-foreground" />`). */
  icon?: ReactNode;
  /** Omis pour un état de chargement (squelette) : seul le bouton menu est utile tant que le contenu réel n'a pas encore de titre. */
  title?: ReactNode;
  /** Contenu additionnel entre le titre et le slot de droite (ex: bascule mode édition). */
  children?: ReactNode;
  /** Actions poussées à droite (ex: bouton fermer), regroupées avec un espacement commun. */
  right?: ReactNode;
}) {
  return (
    <div className="flex h-header-height shrink-0 items-center gap-1 bg-background border-b p-2 touch:p-2.5">
      <MobileDrawerOpenButton />
      <div className="h-8 w-8 flex items-center justify-center">{icon}</div>
      <span className="text-sm font-semibold">{title}</span>
      {children}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}
