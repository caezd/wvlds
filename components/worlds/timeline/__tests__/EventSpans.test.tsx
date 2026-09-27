import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

import { EventSpans, eventSpanPad, layoutEventSpans, type EventSpan } from "@/components/worlds/timeline/EventSpans";
import type { TimelineLayout, TimelineRowBox } from "@/components/worlds/timeline/TimelineLayout";

/** Un relevé de frise : titres à 100px, 500px de haut, et les lignes données. */
function releve(rows: Record<string, TimelineRowBox>, titleX: number | null = 100): TimelineLayout {
  return { width: 600, height: 500, filX: 40, titleX, rows: new Map(Object.entries(rows)) };
}
const entier = (id: string): EventSpan => ({ id, clipTop: false, clipBottom: false });
const LIGNES = { e1: { top: 0, height: 20 }, "e1:end": { top: 200, height: 20 } };

describe("layoutEventSpans", () => {
  it("une barre de la ligne de l'événement à celle de sa fin, 10px avant les titres", () => {
    expect(layoutEventSpans(releve(LIGNES), [entier("e1")]).spans).toEqual([{ id: "e1", top: 10, bottom: 210, x: 90 }]);
  });

  it("un bout hors de ce qui est rendu : la barre file jusqu'au bord", () => {
    expect(layoutEventSpans(releve({ "e1:end": LIGNES["e1:end"] }), [{ id: "e1", clipTop: true, clipBottom: false }]).spans[0])
      .toMatchObject({ top: 0, bottom: 210 });
    expect(layoutEventSpans(releve({ e1: LIGNES.e1 }), [{ id: "e1", clipTop: false, clipBottom: true }]).spans[0])
      .toMatchObject({ top: 10, bottom: 500 });
    expect(layoutEventSpans(releve({}), [{ id: "e1", clipTop: true, clipBottom: true }]).spans[0])
      .toMatchObject({ top: 0, bottom: 500 });
  });

  it("une ligne attendue mais pas rendue, ou rien de rendu : pas de barre", () => {
    expect(layoutEventSpans(releve({ e1: LIGNES.e1 }), [entier("e1")]).spans).toEqual([]);
    expect(layoutEventSpans(releve(LIGNES, null), [entier("e1")]).spans).toEqual([]);
  });

  it("des barres qui se chevauchent : un couloir chacune, 6px de l'une à l'autre vers le fil", () => {
    const rows = Object.fromEntries(["e1", "e2", "e3"].flatMap((id) => [[id, LIGNES.e1], [`${id}:end`, LIGNES["e1:end"]]]));
    const { spans, laneCount } = layoutEventSpans(releve(rows), ["e1", "e2", "e3"].map(entier));
    expect(spans.map((s) => s.x)).toEqual([90, 84, 78]);
    expect(laneCount).toBe(3);
  });

  it("le décalage des titres : rien pour une barre, puis de quoi garder ~10px de part et d'autre", () => {
    expect(eventSpanPad(0)).toBe(0);
    expect(eventSpanPad(1)).toBe(0);
    expect(eventSpanPad(2)).toBe(4);
    expect(eventSpanPad(3)).toBe(10);
  });
});

describe("EventSpans", () => {
  it("trace les barres du relevé, fait ressortir celle survolée, annonce ses couloirs", () => {
    const onLanes = vi.fn();
    const rows = { ...LIGNES, e2: { top: 50, height: 20 }, "e2:end": { top: 300, height: 20 } };
    render(<EventSpans layout={releve(rows)} spans={[entier("e1"), entier("e2")]} active="e1" onLanes={onLanes} />);
    const barre = (id: string) => document.querySelector(`[data-event-span='${id}']`)!;
    expect(barre("e1").getAttribute("d")).toBe("M 90 10 V 210");
    expect(barre("e1")).toHaveAttribute("data-active", "true");
    expect(barre("e2").getAttribute("class")).toContain("opacity-30");
    expect(onLanes).toHaveBeenLastCalledWith(2);
  });
});
