"use client";

import * as React from "react";

/** Délai d'apaisement avant d'enregistrer la largeur atteinte. */
const SAVE_DELAY = 600;

/**
 * Colonne redimensionnable à la poignée, dont la largeur finit par être
 * enregistrée.
 *
 * Écrit d'abord en dur pour la navigation du wiki, puis réclamé à l'identique
 * par la colonne latérale des commentaires et des notes. La seule différence
 * entre les deux est le côté où se trouve la poignée : tirer vers la droite
 * élargit une colonne de gauche, et rétrécit une colonne de droite. D'où
 * `side`, qui n'est que le signe du déplacement.
 *
 * L'enregistrement n'a lieu qu'au relâchement, et après un délai : un
 * glissement produit des dizaines d'événements, et personne ne veut autant
 * d'écritures pour une seule intention.
 */
export function useColumnResize({
  initialWidth,
  min,
  max,
  side,
  onCommit,
}: {
  initialWidth: number;
  min: number;
  max: number;
  /** Côté de la colonne où se trouve la poignée. */
  side: "left" | "right";
  /** Appelé une fois le glissement terminé et le délai écoulé. */
  onCommit: (width: number) => void;
}) {
  const [width, setWidth] = React.useState(initialWidth);
  /**
   * Doublon d'état de la ref ci-dessous, et il le faut.
   *
   * La ref sert aux gestionnaires, qui ne doivent pas provoquer de rendu à
   * chaque pixel. Mais l'appelant, lui, a besoin de SAVOIR qu'un glissement
   * est en cours — celui du wiki retire la colonne quand elle ne tient plus,
   * et la retirer au milieu du geste démonterait la poignée sous le doigt :
   * `terminer` ne serait jamais appelé, et la ref resterait à `true`.
   */
  const [resizing, setResizing] = React.useState(false);

  const dragging = React.useRef(false);
  const startX = React.useRef(0);
  const startWidth = React.useRef(initialWidth);
  const widthRef = React.useRef(width);
  widthRef.current = width;
  const saveTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gardé dans une ref : l'appelant redéfinit souvent la fonction à chaque
  // rendu, et les gestionnaires ci-dessous n'ont pas à en dépendre.
  const onCommitRef = React.useRef(onCommit);
  onCommitRef.current = onCommit;

  const largeurPour = React.useCallback(
    (clientX: number) => {
      const delta = clientX - startX.current;
      const brute = startWidth.current + (side === "left" ? -delta : delta);
      return Math.min(max, Math.max(min, brute));
    },
    [max, min, side],
  );

  // Un glissement laissé en attente ne doit pas écrire après le démontage.
  React.useEffect(() => () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
  }, []);

  function commencer(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    setResizing(true);
    startX.current = e.clientX;
    startWidth.current = widthRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function suivre(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    setWidth(largeurPour(e.clientX));
  }

  function terminer(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    setResizing(false);
    const w = largeurPour(e.clientX);
    setWidth(w);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => onCommitRef.current(w), SAVE_DELAY);
  }

  // Fonctions nommées plutôt que méthodes d'objet : React appelle ces
  // gestionnaires sans receveur, et un `this.terminer(e)` serait indéfini au
  // moment où le pointeur est annulé — c'est-à-dire précisément quand il faut
  // ne pas laisser un glissement en cours.
  const handleProps = {
    onPointerDown: commencer,
    onPointerMove: suivre,
    onPointerUp: terminer,
    onPointerCancel: terminer,
  };

  return { width, resizing, handleProps };
}
