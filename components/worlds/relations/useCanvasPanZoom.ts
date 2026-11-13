"use client";

import * as React from "react";

import {
  BUTTON_FACTOR,
  WHEEL_FACTOR,
  distance,
  focusView,
  zoomAround,
  type Point,
  type View,
} from "./panZoom";

/** En deçà de ce déplacement (px), un appui reste un clic et ne déplace pas le plateau. */
const DRAG_THRESHOLD = 4;
/** Durée des déplacements animés (recentrage, zoom sur un persona). */
export const ANIMATION_MS = 450;
/** Marge intérieure de la fenêtre, de chaque côté (`p-2`). */
const VIEWPORT_PADDING = 8;

const HOME: View = { zoom: 1, pan: { x: 0, y: 0 } };

/**
 * Déplacement et zoom du plateau des relations : molette sous le curseur,
 * glisser (souris ou doigt), pincer à deux doigts, boutons, et les
 * déplacements animés vers un point du repère.
 *
 * Le plateau change de taille réelle (voir `./panZoom`) : le composant pose
 * `width: calc(min(100cqw, 100cqh) × zoom)` et `translate(pan)`. Pendant un
 * geste, aucune transition ; `animating` n'est vrai que le temps d'un
 * déplacement programmé.
 *
 * Un glisser peut partir d'un avatar : le plateau ne se saisit qu'au-delà de
 * quelques pixels, et `wasDragged()` permet au clic qui suit de s'ignorer.
 */
export function useCanvasPanZoom() {
  const [view, setView] = React.useState<View>(HOME);
  const [animating, setAnimating] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  // Les gestes lisent la valeur courante depuis un gestionnaire natif, hors
  // du cycle de rendu : une ref évite de les recréer à chaque changement.
  const viewRef = React.useRef<View>(HOME);
  viewRef.current = view;

  const viewportRef = React.useRef<HTMLDivElement>(null);
  const pointers = React.useRef(new Map<number, Point>());
  const drag = React.useRef<{ start: Point; pan0: Point; moved: boolean } | null>(null);
  const pinch = React.useRef<{ dist0: number; view0: View; mid0: Point } | null>(null);
  const dragged = React.useRef(false);
  const animTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (animTimer.current) clearTimeout(animTimer.current); }, []);

  /** Un point de l'écran, relatif au centre de la fenêtre. */
  const fromCenter = React.useCallback((clientX: number, clientY: number): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  }, []);

  const stopAnimation = React.useCallback(() => {
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = null;
    setAnimating(false);
  }, []);

  /** Pose une vue d'un mouvement animé. */
  const animateTo = React.useCallback((next: View) => {
    if (animTimer.current) clearTimeout(animTimer.current);
    setAnimating(true);
    setView(next);
    animTimer.current = setTimeout(() => { animTimer.current = null; setAnimating(false); }, ANIMATION_MS + 30);
  }, []);

  // Molette : zoom sous le curseur. Le listener doit être non passif pour
  // pouvoir annuler le défilement de la page.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      stopAnimation();
      const anchor = fromCenter(e.clientX, e.clientY);
      setView((v) => zoomAround(v, e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR, anchor));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fromCenter, stopAnimation]);

  function startDrag(p: Point) {
    drag.current = { start: p, pan0: viewRef.current.pan, moved: false };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragged.current = false;
      startDrag({ x: e.clientX, y: e.clientY });
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch.current = { dist0: distance(a, b) || 1, view0: viewRef.current, mid0: fromCenter(mid.x, mid.y) };
      drag.current = null;
      dragged.current = true;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      setView(zoomAround(p.view0, distance(a, b) / p.dist0, p.mid0, fromCenter(mid.x, mid.y)));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.start.x, dy = e.clientY - d.start.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
      d.moved = true;
      dragged.current = true;
      stopAnimation();
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setView((v) => ({ zoom: v.zoom, pan: { x: d.pan0.x + dx, y: d.pan0.y + dy } }));
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      // Un doigt levé pendant un pincement : on repart d'un simple glisser,
      // sinon le plateau saute au prochain mouvement.
      const [rest] = [...pointers.current.values()];
      startDrag(rest);
      drag.current!.moved = true;
      return;
    }
    if (drag.current?.moved) setDragging(false);
    drag.current = null;
  }

  /** Vrai si l'appui qui s'achève a déplacé le plateau : le clic qui suit n'en est pas un. */
  function wasDragged() {
    return dragged.current;
  }

  /** Zoom par paliers (boutons, clavier), autour du centre de la fenêtre. */
  function zoomBy(factor: number) {
    stopAnimation();
    setView((v) => zoomAround(v, factor, { x: 0, y: 0 }));
  }
  const zoomIn = () => zoomBy(BUTTON_FACTOR);
  const zoomOut = () => zoomBy(1 / BUTTON_FACTOR);

  /** Amène un point du repère au centre, à ce zoom, d'un mouvement animé. */
  function focusOn(point: Point, zoom: number) {
    const el = viewportRef.current;
    const base = el ? Math.max(0, Math.min(el.clientWidth, el.clientHeight) - VIEWPORT_PADDING * 2) : 0;
    animateTo(focusView(point, zoom, base));
  }

  /** Retour à 100 %, centré ; animé ou non (changement de vue). */
  function reset(animated = true) {
    if (animated) animateTo(HOME);
    else { stopAnimation(); setView(HOME); }
  }

  return {
    zoom: view.zoom,
    pan: view.pan,
    animating,
    dragging,
    viewportRef,
    wasDragged,
    zoomBy,
    zoomIn,
    zoomOut,
    focusOn,
    reset,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
