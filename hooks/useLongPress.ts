import { useCallback, useEffect, useRef } from "react";

/**
 * Tolérance de déplacement du doigt, en pixels, avant d'abandonner l'appui long.
 *
 * Le geste était annulé au MOINDRE `touchmove`. Or un doigt posé sur un écran ne
 * tient jamais parfaitement immobile : les navigateurs émettent `touchmove` pour
 * un déplacement de quelques pixels, et l'appui long échouait donc souvent sans
 * raison apparente — on appuie, rien ne se passe, on recommence.
 *
 * 10 px laisse passer le tremblement naturel tout en abandonnant dès qu'il
 * s'agit d'un défilement, qui dépasse ce seuil immédiatement.
 */
const TOLERANCE_PX = 10;

/** Un drawer (persona, message, monde…) est monté quelque part sur la page —
 *  ouvert, ou encore en cours de fermeture (l'élément reste le temps de
 *  l'animation). Voir components/ui/drawer.tsx. */
function isAnyDrawerOpen(): boolean {
  return typeof document !== "undefined" && !!document.querySelector('[data-slot="drawer-viewport"]');
}

export function useLongPress(onLongPress: () => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const departRef = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    departRef.current = null;
  }, []);

  const start = useCallback(
    (e?: React.TouchEvent) => {
      // Un portail React (drawer, dialog, menu…) sort son contenu du DOM de
      // son parent, MAIS PAS de l'arbre React : les événements synthétiques
      // continuent d'y remonter. Un appui à l'intérieur d'un drawer ouvert
      // depuis cet élément (ex. le profil d'un persona ouvert depuis un
      // message) atteint donc ce `onTouchStart` comme s'il venait de
      // l'élément lui-même. On repart du DOM réel — le seul endroit où le
      // portail a effectivement déplacé le contenu — pour ne s'armer que sur
      // un appui réellement posé sur cet élément.
      // `currentTarget`/`target` peuvent manquer d'un événement synthétique
      // partiel : sans les deux, il n'y a rien à vérifier et on s'arme.
      if (e?.currentTarget instanceof Node && e.target instanceof Node && !e.currentTarget.contains(e.target)) return;
      firedRef.current = false;
      const doigt = e?.touches?.[0];
      departRef.current = doigt ? { x: doigt.clientX, y: doigt.clientY } : null;
      timerRef.current = setTimeout(() => {
        // Cas restant : l'appui a bien commencé sur l'élément, mais a ouvert
        // un drawer entre-temps (tap sur l'avatar, doigt encore posé) — le
        // menu n'a alors plus lieu de s'ouvrir par-dessus.
        if (isAnyDrawerOpen()) return;
        firedRef.current = true;
        onLongPress();
      }, delay);
    },
    [onLongPress, delay],
  );

  const move = useCallback(
    (e: React.TouchEvent) => {
      const depart = departRef.current;
      const doigt = e.touches?.[0];
      // Sans point de départ connu (appelant qui ne transmet pas l'événement),
      // on garde l'ancien comportement : tout mouvement abandonne.
      if (!depart || !doigt) {
        cancel();
        return;
      }
      if (Math.hypot(doigt.clientX - depart.x, doigt.clientY - depart.y) > TOLERANCE_PX) {
        cancel();
      }
    },
    [cancel],
  );

  // Un composant démonté pendant l'appui laissait son minuteur courir : le
  // rappel partait ensuite dans le vide — et sur mobile, le téléphone vibrait
  // pour un message qui n'était plus là.
  useEffect(() => cancel, [cancel]);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: move,
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
