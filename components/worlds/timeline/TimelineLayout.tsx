"use client";

import * as React from "react";

/** Une ligne de la frise telle que mesurée : son haut et sa hauteur, dans le repère du conteneur. */
export type TimelineRowBox = { top: number; height: number };

/**
 * Le relevé de la frise rendue, dont se servent ses calques (lignes de
 * suite, fil d'un persona, barres de durée) : la position de chaque ligne,
 * le fil, le début des titres, la taille du conteneur.
 *
 * Les lignes se repèrent par l'identifiant de ce qu'elles montrent : salon
 * (`data-room-id`), journal (`data-journal-id`), événement (`data-event-id`),
 * et la fin d'un événement, sous `<id>:end` (`data-event-end-id`).
 */
export type TimelineLayout = {
  width: number;
  height: number;
  /** Le fil : le centre des anneaux (0 si rien n'est rendu). */
  filX: number;
  /** Le début des titres, tous au même retrait ; `null` si rien n'est rendu. */
  titleX: number | null;
  rows: ReadonlyMap<string, TimelineRowBox>;
};

export const EMPTY_TIMELINE_LAYOUT: TimelineLayout = { width: 0, height: 0, filX: 0, titleX: null, rows: new Map() };

const ROWS = "[data-room-id], [data-journal-id], [data-event-id], [data-event-end-id]";
const MARK = "[data-testid='timeline-ring'], [data-testid='timeline-event-mark']";

/** Relève la frise rendue dans `container`, en une passe. */
export function measureTimeline(container: HTMLElement): TimelineLayout {
  const rect = container.getBoundingClientRect();
  const rows = new Map<string, TimelineRowBox>();
  for (const el of container.querySelectorAll<HTMLElement>(ROWS)) {
    const { roomId, journalId, eventId, eventEndId } = el.dataset;
    const id = roomId ?? journalId ?? eventId ?? (eventEndId ? `${eventEndId}:end` : undefined);
    if (!id) continue;
    const r = el.getBoundingClientRect();
    rows.set(id, { top: r.top - rect.top, height: r.height });
  }
  const mark = container.querySelector<HTMLElement>(MARK)?.getBoundingClientRect();
  const title = container.querySelector<HTMLElement>("[data-title-start]")?.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
    filX: mark ? mark.left - rect.left + mark.width / 2 : 0,
    titleX: title ? title.left - rect.left : null,
    rows,
  };
}

/**
 * Tient à jour le relevé de la frise : à chaque changement de `version`
 * (ce qui est rendu, et ce qui décale les titres), et au redimensionnement
 * du conteneur — une mesure par image au plus, pour tous les calques à la
 * fois. Avant, chaque calque mesurait de son côté, avec son propre
 * observateur : trois passes sur les mêmes lignes.
 */
export function useTimelineLayout(containerRef: React.RefObject<HTMLElement | null>, version: string): TimelineLayout {
  const [layout, setLayout] = React.useState<TimelineLayout>(EMPTY_TIMELINE_LAYOUT);
  const measure = React.useCallback(() => {
    const container = containerRef.current;
    if (container) setLayout(measureTimeline(container));
  }, [containerRef]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure, version]);
  // Au montage, la référence du conteneur (un parent) n'est pas encore posée
  // pendant les effets de mise en page de ses enfants : on remesure après.
  React.useEffect(() => {
    measure();
  }, [measure]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [containerRef, measure]);

  return layout;
}

/**
 * Les calques de la frise, sur un relevé commun. Le relevé vit ici, pas dans
 * la frise : une mesure ne redessine que les calques, jamais ses lignes.
 */
export function TimelineOverlays({
  containerRef,
  version,
  children,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  version: string;
  children: (layout: TimelineLayout) => React.ReactNode;
}) {
  const layout = useTimelineLayout(containerRef, version);
  return <>{children(layout)}</>;
}
