"use client";

import type { ReactNode } from "react";

/**
 * Enveloppe commune aux deux points d'entrée du sélecteur d'emoji (réactions
 * d'un message, bouton des blocs).
 *
 * Elle porte la classe que cible l'habillage d'`emoji-picker-react` dans
 * app/globals.css. Un composant plutôt qu'une chaîne recopiée de chaque côté :
 * autrement, un seul des deux sélecteurs risque de rester sur l'apparence
 * d'origine de la librairie, écart qui ne se voit que dans un des contextes.
 *
 * Elle arrête aussi la molette et le glissement tactile : sinon, une fois la
 * liste d'emojis arrivée au bout, le défilement se propage à la conversation
 * en dessous.
 */
export function EmojiPickerFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="wvlds-emoji-picker"
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
