"use client";

import { useEffect, useState } from "react";

/**
 * Vrai quand le repère `sentinel` est entièrement sorti par le HAUT de la
 * zone de défilement `root` — c'est-à-dire quand l'utilisateur a fait défiler
 * au-delà de lui.
 *
 * `topInset` rétrécit la zone par le haut, en pixels : la hauteur d'une barre
 * collante qui recouvre le début du contenu. Le repère compte alors comme
 * « passé » dès qu'il disparaît sous cette barre, et non sous le bord de la
 * zone.
 *
 * Les deux éléments se passent en VALEUR (état posé par une ref de rappel),
 * pas en ref : un changement de vue démonte la zone et le repère, et en
 * remonte d'autres en revenant. Une ref garde alors l'ancien élément, détaché
 * — que l'observateur signale « hors de vue, rectangle nul », donc passé pour
 * toujours : la barre restait affichée tout en haut de la page.
 *
 * Observation par IntersectionObserver plutôt qu'un écouteur de défilement :
 * aucun calcul à chaque pixel, le navigateur ne signale que les franchissements.
 * Faute d'observateur (rendu serveur, jsdom), reste à `false`.
 */
export function useScrolledPast(
  sentinel: Element | null,
  root: Element | null,
  topInset = 0,
): boolean {
  const [passed, setPassed] = useState(false);

  useEffect(() => {
    // Nouveau repère : on repart de zéro plutôt que d'afficher l'état du
    // précédent le temps que l'observateur se prononce.
    setPassed(false);
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Sorti par le haut seulement : un repère encore sous le bord bas de
        // la zone (page très haute, jamais défilée) n'est pas « passé ».
        // `rootBounds` tient déjà compte de `rootMargin`.
        const limit = entry.rootBounds?.top ?? topInset;
        setPassed(!entry.isIntersecting && entry.boundingClientRect.bottom <= limit);
      },
      { root, rootMargin: `-${topInset}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, root, topInset]);

  return passed;
}
