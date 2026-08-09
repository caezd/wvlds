import { useCallback, useRef } from "react";

export function useLongPress(onLongPress: () => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const start = useCallback(() => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
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
    onClick: (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.preventDefault();
        firedRef.current = false;
      }
    },
  };
}
