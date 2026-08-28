"use client";

import * as React from "react";

import { borner, distance, zoomAutourDuPoint, type Point } from "./panZoom";

/**
 * Déplacement et zoom du canevas de relations : molette, glisser à la souris,
 * un doigt pour déplacer, deux pour pincer.
 *
 * Sorti du composant, où ces quatre gestes occupaient une centaine de lignes au
 * milieu du chargement des données et du rendu. L'arithmétique du zoom est
 * encore un cran plus bas, dans `./panZoom`, et testée à part.
 *
 * @param estEnDeplacementDeBloc rend `true` tant qu'un bloc est saisi. Sans
 *   cette garde, déplacer un bloc déplacerait aussi le canevas sous lui.
 */
export function useCanvasPanZoom(estEnDeplacementDeBloc: () => boolean) {
  const [pan, setPan] = React.useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = React.useState(1);

  // Les gestes lisent la valeur courante depuis un gestionnaire d'événement
  // natif, hors du cycle de rendu : une ref évite de les recréer à chaque
  // changement d'échelle.
  const panRef = React.useRef<Point>({ x: 0, y: 0 });
  const scaleRef = React.useRef(1);
  panRef.current = pan;
  scaleRef.current = scale;

  const outerRef = React.useRef<HTMLDivElement>(null); // viewport fixe
  const canvasRef = React.useRef<HTMLDivElement>(null); // div transformée

  const panDrag = React.useRef<{ start: Point; pan0: Point } | null>(null);
  const pinchRef = React.useRef<{ dist0: number; scale0: number; pan0: Point; mid0: Point } | null>(null);
  const touchRef = React.useRef<{ start: Point; pan0: Point } | null>(null);

  // Molette : zoom vers le curseur. Le listener doit être non passif pour
  // pouvoir annuler le défilement de la page.
  React.useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const facteur = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const depart = scaleRef.current;
      const suivant = borner(depart * facteur);
      const rect = el!.getBoundingClientRect();
      const ancre = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setScale(suivant);
      setPan((p) => zoomAutourDuPoint(depart, suivant, p, ancre).pan);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Souris : glisser sur le fond du canevas. Les blocs arrêtent la propagation.
  function onCanvasDown(e: React.PointerEvent) {
    if (e.button !== 0 || estEnDeplacementDeBloc()) return;
    panDrag.current = { start: { x: e.clientX, y: e.clientY }, pan0: panRef.current };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).style.cursor = "grabbing";
  }

  function onCanvasMove(e: React.PointerEvent) {
    const d = panDrag.current;
    if (!d) return;
    setPan({ x: d.pan0.x + e.clientX - d.start.x, y: d.pan0.y + e.clientY - d.start.y });
  }

  function onCanvasUp(e: React.PointerEvent) {
    panDrag.current = null;
    (e.currentTarget as HTMLElement).style.cursor = "grab";
  }

  // Tactile : un doigt déplace, deux doigts pincent.
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      touchRef.current = {
        start: { x: e.touches[0].clientX, y: e.touches[0].clientY },
        pan0: panRef.current,
      };
      pinchRef.current = null;
    } else if (e.touches.length === 2) {
      const a = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const b = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      pinchRef.current = {
        dist0: distance(a, b),
        scale0: scaleRef.current,
        pan0: panRef.current,
        mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      touchRef.current = null;
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && touchRef.current) {
      const t = touchRef.current;
      setPan({
        x: t.pan0.x + e.touches[0].clientX - t.start.x,
        y: t.pan0.y + e.touches[0].clientY - t.start.y,
      });
    } else if (e.touches.length === 2 && pinchRef.current) {
      const p = pinchRef.current;
      const a = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const b = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      const rect = outerRef.current!.getBoundingClientRect();
      const coin = { x: rect.left, y: rect.top };
      const resultat = zoomAutourDuPoint(
        p.scale0,
        p.scale0 * (distance(a, b) / p.dist0),
        p.pan0,
        { x: p.mid0.x - coin.x, y: p.mid0.y - coin.y },
        { x: (a.x + b.x) / 2 - coin.x, y: (a.y + b.y) / 2 - coin.y },
      );
      setScale(resultat.scale);
      setPan(resultat.pan);
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length === 0) {
      touchRef.current = null;
      pinchRef.current = null;
    } else if (e.touches.length === 1) {
      // Un doigt levé pendant un pincement : on repart d'un simple déplacement,
      // sinon le canevas saute au prochain mouvement.
      pinchRef.current = null;
      touchRef.current = {
        start: { x: e.touches[0].clientX, y: e.touches[0].clientY },
        pan0: panRef.current,
      };
    }
  }

  return {
    pan, setPan,
    scale, setScale,
    scaleRef,
    outerRef, canvasRef,
    onCanvasDown, onCanvasMove, onCanvasUp,
    onTouchStart, onTouchMove, onTouchEnd,
  };
}
