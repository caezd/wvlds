import { useCallback, useRef } from "react";

/** Un drawer (persona, message, monde…) est monté quelque part sur la page —
 *  ouvert, ou encore en cours de fermeture (l'élément reste le temps de
 *  l'animation). Voir components/ui/drawer.tsx. */
function isAnyDrawerOpen(): boolean {
  return typeof document !== "undefined" && !!document.querySelector('[data-slot="drawer-viewport"]');
}

export function useLongPress(onLongPress: () => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const start = useCallback((event?: React.TouchEvent) => {
    // Un portail React (drawer, dialog, menu…) sort son contenu du DOM de
    // son parent, MAIS PAS de l'arbre React : les événements synthétiques
    // continuent d'y remonter. Un appui à l'intérieur d'un drawer ouvert
    // depuis cet élément (ex. le profil d'un persona ouvert depuis un
    // message) atteint donc ce `onTouchStart` comme s'il venait de
    // l'élément lui-même. On repart du DOM réel — le seul endroit où le
    // portail a effectivement déplacé le contenu — pour ne s'armer que sur
    // un appui réellement posé sur cet élément.
    if (event && !event.currentTarget.contains(event.target as Node)) return;
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      // Cas restant : l'appui a bien commencé sur l'élément, mais a ouvert
      // un drawer entre-temps (tap sur l'avatar, doigt encore posé) — le
      // menu n'a alors plus lieu de s'ouvrir par-dessus.
      if (isAnyDrawerOpen()) return;
      firedRef.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      // Empêche le menu contextuel natif si le long-press a déjà déclenché l'action
      if (firedRef.current) e.preventDefault();
    },
    // Empêche le clic (ex: navigation d'un <Link>) qui suit le relâchement du
    // doigt sur mobile quand le long-press a déjà déclenché son action.
    // `cancel()` inconditionnel : un clic prouve que le geste s'est résolu
    // en tap, donc que le minuteur n'a plus lieu d'être.
    onClick: (e: React.MouseEvent) => {
      cancel();
      if (firedRef.current) {
        e.preventDefault();
        firedRef.current = false;
      }
    },
  };
}
