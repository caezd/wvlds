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
      firedRef.current = false;
      const doigt = e?.touches?.[0];
      departRef.current = doigt ? { x: doigt.clientX, y: doigt.clientY } : null;
      timerRef.current = setTimeout(() => {
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
    onClick: (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.preventDefault();
        firedRef.current = false;
      }
    },
  };
}
