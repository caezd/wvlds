"use client";

import * as React from "react";

import { supabaseThumb, widthTierFor } from "@/lib/storage";
import {
  applyZoom,
  centerOn,
  clampOffset,
  coverSize,
  distance,
  initialTransform,
  midpoint,
  pinchScale,
  wheelScale,
  type MapBounds,
  type MapTransform,
  type Point,
} from "@/components/worlds/map/zoom";

/**
 * Largeurs servies pour la carte, par ordre croissant.
 *
 * Des paliers plutôt que la largeur mesurée : celle-ci diffère à chaque écran
 * et à chaque cran de zoom, donc une URL par visiteur, donc un téléchargement
 * par visiteur — même raisonnement que les paliers d'avatars dans
 * `lib/storage.ts`.
 *
 * Deux paliers et non un seul. Le premier couvre l'affichage courant, jusqu'à
 * un écran large. Le second évite de sauter directement à l'original — qui
 * peut faire 4096 px pour trois fois le poids — dès qu'on entre un peu dans la
 * carte. L'original ne vient qu'au-delà, quand ses pixels servent enfin.
 */
export const MAP_WIDTH_TIERS = [1600, 2560];

const IDENTITY: MapTransform = { scale: 1, x: 0, y: 0 };

/** Écart au-delà duquel un geste est un déplacement, et non un clic. */
const DRAG_THRESHOLD_PX = 4;

export type MapViewportOptions = {
  /** Image de la carte affichée, ou `null` tant qu'il n'y en a pas. */
  imageUrl: string | null;
  /**
   * Change quand la vue doit repartir de zéro : autre carte, ou autre image de
   * la même carte. Une clé plutôt que l'URL seule — deux cartes peuvent porter
   * la même image.
   */
  viewKey: string;
  /** Curseur du cadre au repos ; `grabbing` le remplace pendant un déplacement. */
  idleCursor: string;
  /**
   * Appelé après chaque écriture de la transformation sur le DOM, dans la même
   * image : c'est là que ce qui doit suivre la carte — le panneau d'un lieu —
   * se replace, sans repasser par un rendu.
   */
  onPaint?: () => void;
  /**
   * Appelé quand un geste ou une mesure vient de se terminer : le moment de
   * recopier dans l'état React ce que `onPaint` a écrit sur le DOM.
   */
  onSettle?: (transform: MapTransform) => void;
};

/**
 * La vue de la carte : sa taille ajustée au cadre, sa transformation, ses
 * gestes, et le palier d'image qu'elle affiche.
 *
 * ── Hors de React, délibérément ──────────────────────────────
 * La transformation vit dans une ref et s'écrit directement sur le DOM, une
 * fois par image (`requestAnimationFrame`). Elle passait auparavant par
 * `useState` : chaque pixel de déplacement re-rendait la carte ET ses N
 * marqueurs, chacun remontant son icône. Les calculs eux-mêmes sont dans
 * `zoom.ts`, vérifiables sans navigateur.
 *
 * Le composant qui monte la carte ne connaît de tout ceci que trois refs à
 * poser, quatre gestionnaires de pointeur à brancher, et deux rappels.
 */
export function useMapViewport({ imageUrl, viewKey, idleCursor, onPaint, onSettle }: MapViewportOptions) {
  // Les rappels passent par des refs pour que rien ici ne change d'identité
  // quand l'appelant se re-rend : la `callback ref` du cadre en dépend, et la
  // voir changer détacherait puis rattacherait l'écoute de la molette.
  const onPaintRef = React.useRef(onPaint);
  onPaintRef.current = onPaint;
  const onSettleRef = React.useRef(onSettle);
  onSettleRef.current = onSettle;
  const imageUrlRef = React.useRef(imageUrl);
  imageUrlRef.current = imageUrl;
  const idleCursorRef = React.useRef(idleCursor);
  idleCursorRef.current = idleCursor;

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const wheelCleanupRef = React.useRef<(() => void) | null>(null);

  const transformRef = React.useRef<MapTransform>(IDENTITY);
  const rafRef = React.useRef<number | null>(null);
  /** La vue par défaut n'est posée qu'une fois par carte. */
  const initialViewDoneRef = React.useRef(false);

  const [imageLoaded, setImageLoaded] = React.useState(false);
  /** Palier de largeur affiché ; `null` désigne l'original. */
  const [widthTier, setWidthTier] = React.useState<number | null>(MAP_WIDTH_TIERS[0]);
  const widthTierRef = React.useRef<number | null>(MAP_WIDTH_TIERS[0]);
  widthTierRef.current = widthTier;

  // Le curseur suit le geste sans rendu : le mettre dans l'état re-rendait la
  // carte et ses marqueurs deux fois par déplacement, à la prise et au lâcher.
  React.useEffect(() => {
    const node = containerRef.current;
    if (node) node.style.cursor = idleCursor;
  }, [idleCursor]);

  // ── Ajustement de la carte au cadre ───────────────────────────
  // La carte était posée en pleine largeur : sur un cadre plus haut que large
  // — un téléphone — elle n'occupait qu'un bandeau, le reste en fond noir. On
  // la met à la plus petite taille qui COUVRE le cadre, et c'est cette taille
  // qui fait l'échelle 1 : le fond ne peut donc jamais réapparaître.
  const [baseSize, setBaseSize] = React.useState({ width: 0, height: 0 });
  const baseSizeRef = React.useRef(baseSize);
  baseSizeRef.current = baseSize;
  const naturalRef = React.useRef<{ width: number; height: number } | null>(null);

  const measure = React.useCallback(() => {
    const container = containerRef.current;
    const natural = naturalRef.current;
    if (!container || !natural) return;
    const next = coverSize(
      { width: container.clientWidth, height: container.clientHeight },
      natural,
    );
    setBaseSize((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next,
    );
  }, []);

  /** Écrit la transformation courante sur le DOM — hors de React. */
  const paint = React.useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const { scale, x, y } = transformRef.current;
    wrapper.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    // Les marqueurs se remettent à l'endroit avec cette variable plutôt qu'avec
    // une prop : ils ne re-rendent donc pas d'un cran de zoom à l'autre.
    wrapper.style.setProperty("--pin-inv-scale", String(1 / scale));
    onPaintRef.current?.();
  }, []);

  const schedulePaint = React.useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      paint();
    });
  }, [paint]);

  // Remettre le jeton à `null`, et pas seulement annuler : `schedulePaint` se
  // fie à `rafRef.current` pour savoir s'il a déjà une image en attente. Un
  // jeton annulé mais laissé en place le convainc pour toujours qu'il n'a rien
  // à faire — et plus rien ne se repeint.
  //
  // Ce n'est pas un cas de bord : Next.js active `reactStrictMode` par défaut,
  // et React monte alors le composant, exécute ce nettoyage, puis le remonte.
  // En développement, le zoom et le déplacement étaient donc morts dès le
  // premier rendu, sans la moindre erreur en console.
  React.useEffect(() => () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const settle = React.useCallback(() => { onSettleRef.current?.(transformRef.current); }, []);

  /**
   * Bornes du geste : le cadre tel qu'il est à l'écran, et la carte à la taille
   * que `coverSize` lui a donnée.
   *
   * La taille vient de l'état et non d'une relecture de l'image : c'est lui qui
   * fait autorité — le DOM ne fait que le refléter — et on évite au passage un
   * calcul de mise en page à chaque image d'un déplacement.
   */
  const bounds = React.useCallback((): MapBounds | null => {
    const container = containerRef.current;
    if (!container) return null;
    return {
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
      imageWidth: baseSizeRef.current.width,
      imageHeight: baseSizeRef.current.height,
    };
  }, []);

  /**
   * Monte d'un palier quand la carte est affichée plus grande que le palier
   * courant. On ne redescend jamais : l'image plus fine est déjà téléchargée,
   * la reperdre au premier dézoom ne gagnerait rien et ferait clignoter.
   *
   * Le seuil est la taille RÉELLEMENT affichée, et non le simple fait d'avoir
   * zoomé : sur un téléphone, la vue par défaut tient largement dans le premier
   * palier, et l'original — jusqu'à 4096 px de large — n'a aucune raison d'être
   * téléchargé.
   */
  const requestWidthTier = React.useCallback((scale: number) => {
    const url = imageUrlRef.current;
    const courant = widthTierRef.current;
    // `null` est déjà le plus haut palier : rien au-dessus de l'original.
    if (!url || courant === null) return;

    const besoin = widthTierFor(baseSizeRef.current.width * scale, MAP_WIDTH_TIERS);
    if (besoin !== null && besoin <= courant) return;

    // Retenu tout de suite : sans quoi chaque cran de molette relancerait le
    // même préchargement.
    widthTierRef.current = besoin;
    const cible = besoin === null ? url : (supabaseThumb(url, besoin) ?? url);

    // Préchargée hors écran : l'échange de `src` se fait alors sur une image
    // déjà en cache, sans le blanc d'un rechargement.
    const preload = new window.Image();
    preload.onload = () => setWidthTier(besoin);
    preload.src = cible;
  }, []);

  const setTransform = React.useCallback(
    (next: MapTransform) => {
      if (next === transformRef.current) return;
      transformRef.current = next;
      requestWidthTier(next.scale);
      schedulePaint();
    },
    [requestWidthTier, schedulePaint],
  );

  // Retour à l'échelle 1 quand l'image change — et SEULEMENT alors.
  //
  // Les refs sont attachées avant que les effets ne s'exécutent : au montage,
  // l'image déjà en cache a donc livré ses dimensions et le cadre a été mesuré
  // AVANT que cet effet ne parte. Le laisser s'exécuter là effaçait cette
  // mesure, et la carte restait à zéro faute d'un second déclencheur.
  const lastViewKeyRef = React.useRef(viewKey);
  React.useEffect(() => {
    if (lastViewKeyRef.current === viewKey) return;
    lastViewKeyRef.current = viewKey;

    transformRef.current = IDENTITY;
    initialViewDoneRef.current = false;
    naturalRef.current = null;
    setBaseSize({ width: 0, height: 0 });
    widthTierRef.current = MAP_WIDTH_TIERS[0];
    setWidthTier(MAP_WIDTH_TIERS[0]);
    setImageLoaded(false);
    schedulePaint();
  }, [viewKey, schedulePaint]);

  // React attache les refs des enfants avant celles de leurs parents : quand
  // l'image en cache signale ses dimensions, le cadre n'est pas encore connu et
  // la mesure ne peut pas aboutir. Cet effet, lui, s'exécute une fois tout en
  // place.
  React.useEffect(() => { measure(); }, [measure, imageLoaded]);

  // La taille ajustée vient de changer (image chargée, cadre redimensionné).
  //
  // À la première mesure, on pose la vue par défaut : la carte remplit le
  // cadre. Ensuite, plus jamais — redimensionner la fenêtre ne doit pas
  // ramener de force quelqu'un qui s'était déplacé et avait choisi son zoom ;
  // on se contente alors de re-borner son décalage.
  React.useEffect(() => {
    const b = bounds();
    if (!b || !baseSize.width) return;

    if (initialViewDoneRef.current) {
      const { scale, x, y } = transformRef.current;
      transformRef.current = { scale, ...clampOffset(x, y, scale, b) };
    } else {
      initialViewDoneRef.current = true;
      transformRef.current = initialTransform(b);
      requestWidthTier(transformRef.current.scale);
    }
    schedulePaint();
    settle();
  }, [baseSize.width, baseSize.height, bounds, requestWidthTier, schedulePaint, settle]);

  /**
   * Le cadre a changé de taille : fenêtre redimensionnée, tiroir latéral,
   * colonne des lieux ouverte ou fermée à sa gauche.
   *
   * On re-borne ICI plutôt que de s'en remettre à l'effet qui surveille la
   * taille ajustée de la carte, car celle-ci peut fort bien ne pas bouger : une
   * carte commandée par sa hauteur garde ses dimensions quand le cadre
   * s'élargit. L'effet ne se déclenche alors pas, et la carte resterait décalée
   * de la largeur gagnée — avec le panneau du lieu ouvert, planté à côté de son
   * épingle.
   */
  const handleFrameResized = React.useCallback(() => {
    measure();
    const b = bounds();
    if (b) {
      const { scale, x, y } = transformRef.current;
      transformRef.current = { scale, ...clampOffset(x, y, scale, b) };
    }
    schedulePaint();
    settle();
  }, [bounds, measure, schedulePaint, settle]);

  React.useEffect(() => {
    window.addEventListener("resize", handleFrameResized);
    return () => window.removeEventListener("resize", handleFrameResized);
  }, [handleFrameResized]);

  // ── Molette : agrandissement centré sur le curseur ────────────
  // Callback ref : s'exécute quand l'élément entre/sort du DOM, et permet
  // d'écouter `wheel` en non-passif (donc d'annuler le défilement de la page).
  const containerCallbackRef = React.useCallback((el: HTMLDivElement | null) => {
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current();
      wheelCleanupRef.current = null;
    }
    containerRef.current = el;
    if (!el) return;
    const node = el; // variable non-nullable pour la closure
    node.style.cursor = idleCursorRef.current;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const b = bounds();
      if (!b) return;
      const rect = node.getBoundingClientRect();
      setTransform(
        applyZoom(
          transformRef.current,
          wheelScale(transformRef.current.scale, e.deltaY),
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          b,
        ),
      );
      settle();
    }

    node.addEventListener("wheel", onWheel, { passive: false });

    // Le cadre se redimensionne sans que la fenêtre bouge : ouverture du tiroir
    // latéral, rotation d'un téléphone, panneau du wiki tiré. `ResizeObserver`
    // le voit, l'événement `resize` de la fenêtre non.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => handleFrameResized());
    observer?.observe(node);
    measure();

    wheelCleanupRef.current = () => {
      node.removeEventListener("wheel", onWheel);
      observer?.disconnect();
    };
  }, [bounds, handleFrameResized, measure, setTransform, settle]);

  /**
   * Ref de l'image, doublée d'un contrôle de `complete`.
   *
   * Une image déjà en cache peut être chargée AVANT que React n'attache son
   * `onLoad` : sans cette vérification à l'attachement, elle resterait à
   * `opacity: 0` pour toujours — carte blanche, épingles suspendues dans le
   * vide. (Même écueil que `components/ui/stored-image.tsx`.)
   */
  const imageCallbackRef = React.useCallback((node: HTMLImageElement | null) => {
    imageRef.current = node;
    if (node?.complete && node.naturalWidth > 0) {
      naturalRef.current = { width: node.naturalWidth, height: node.naturalHeight };
      measure();
      setImageLoaded(true);
    }
  }, [measure]);

  const onImageLoad = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    naturalRef.current = { width: img.naturalWidth, height: img.naturalHeight };
    measure();
    setImageLoaded(true);
  }, [measure]);

  // ── Déplacement à un doigt, pincement à deux ──────────────────
  const pointers = React.useRef(new Map<number, Point>());
  const pinch = React.useRef<{ distance: number; scale: number } | null>(null);
  const panStart = React.useRef<
    { clientX: number; clientY: number; x: number; y: number } | null
  >(null);
  const didPan = React.useRef(false);

  /** Position d'un pointeur dans le repère du cadre. */
  function pointerPos(e: React.PointerEvent): Point | null {
    const node = containerRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function setCursor(cursor: string) {
    const node = containerRef.current;
    if (node) node.style.cursor = cursor;
  }

  /**
   * Le cadre s'approprie le pointeur, pour continuer de le suivre s'il sort.
   *
   * Facultatif : le navigateur refuse la capture d'un pointeur qui n'est plus
   * actif, et jsdom ne l'implémente pas du tout.
   */
  function capturer(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const pos = pointerPos(e);
    if (!pos) return;
    pointers.current.set(e.pointerId, pos);

    // La capture du pointeur attend le premier vrai déplacement — voir
    // `capturer` ci-dessous. Le pincement, lui, la prend tout de suite : il
    // n'a pas de clic à préserver, et perdre un doigt sorti du cadre le
    // couperait net.
    if (pointers.current.size >= 2) {
      capturer(e);
      // Deux doigts : on pince. Le déplacement en cours s'arrête là, et le
      // geste ne pourra plus être pris pour un clic.
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: distance(a, b), scale: transformRef.current.scale };
      panStart.current = null;
      didPan.current = true;
      setCursor(idleCursorRef.current);
      return;
    }

    didPan.current = false;
    panStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      x: transformRef.current.x,
      y: transformRef.current.y,
    };
    setCursor("grabbing");
  }, []);

  const onPointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const pos = pointerPos(e);
    if (!pos) return;
    pointers.current.set(e.pointerId, pos);

    const b = bounds();
    if (!b) return;

    if (pinch.current && pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()];
      setTransform(
        applyZoom(
          transformRef.current,
          pinchScale(pinch.current.scale, pinch.current.distance, distance(p1, p2)),
          midpoint(p1, p2),
          b,
        ),
      );
      return;
    }

    if (!panStart.current) return;
    const dx = e.clientX - panStart.current.clientX;
    const dy = e.clientY - panStart.current.clientY;
    if (!didPan.current && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
      didPan.current = true;
      // C'est ici, et pas au `pointerdown`, que le cadre s'approprie le
      // pointeur : il en a besoin pour suivre un doigt sorti de lui, mais le
      // prendre plus tôt lui aurait fait AVALER LE CLIC. Le navigateur envoie
      // en effet le `click` à l'élément qui capture, et non à celui qu'on a
      // touché : les polygones des régions — les seuls éléments cliquables de
      // l'enveloppe qui laissent passer le geste de déplacement, justement
      // pour qu'on puisse déplacer la carte en les saisissant — ne recevaient
      // donc jamais leur clic. En mode édition, il posait une épingle à leur
      // place.
      capturer(e);
    }
    if (!didPan.current) return;
    const { scale } = transformRef.current;
    transformRef.current = {
      scale,
      ...clampOffset(panStart.current.x + dx, panStart.current.y + dy, scale, b),
    };
    schedulePaint();
  }, [bounds, schedulePaint, setTransform]);

  const onPointerUp = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // Un doigt encore posé après un pincement ne reprend pas le déplacement au
    // vol : la carte sauterait de la position du pincement à la sienne.
    panStart.current = null;
    if (pointers.current.size === 0) setCursor(idleCursorRef.current);
    settle();
    // `didPan` est relu par `consumeDidPan` dans le clic qui suit.
  }, [settle]);

  /**
   * Le geste qui vient de s'achever a-t-il déplacé la carte ? À relire dans le
   * `click` qui suit un `pointerup`, pour ne pas poser d'épingle au bout d'un
   * déplacement. Consomme la réponse.
   */
  const consumeDidPan = React.useCallback((): boolean => {
    const moved = didPan.current;
    didPan.current = false;
    return moved;
  }, []);

  /** Amène un point de la carte au centre du cadre, à échelle inchangée. */
  const centerOnPoint = React.useCallback((point: Point) => {
    const b = bounds();
    if (!b) return;
    transformRef.current = centerOn(b, transformRef.current.scale, point);
    schedulePaint();
  }, [bounds, schedulePaint]);

  const imageSrc = imageUrl
    ? (widthTier === null ? imageUrl : supabaseThumb(imageUrl, widthTier) ?? imageUrl)
    : null;

  return {
    /** À poser sur le cadre : molette, observation de sa taille, curseur. */
    containerCallbackRef,
    /** À poser sur l'enveloppe transformée, celle qui porte l'image et les épingles. */
    wrapperRef,
    /** L'image, lue par ceux qui se placent d'après son rectangle à l'écran. */
    imageRef,
    imageCallbackRef,
    onImageLoad,
    imageSrc,
    imageLoaded,
    /** Taille de la carte à l'échelle 1 — celle de l'enveloppe. */
    baseSize,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    consumeDidPan,
    centerOnPoint,
    schedulePaint,
  };
}
