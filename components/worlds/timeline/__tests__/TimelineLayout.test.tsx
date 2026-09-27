import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act, render } from "@testing-library/react";

import { measureTimeline, useTimelineLayout, type TimelineLayout } from "@/components/worlds/timeline/TimelineLayout";

// jsdom ne met rien en page : chaque élément dit où il est par ses attributs
// `data-top` / `data-left` / `data-h`, relevés par getBoundingClientRect.
let mesures = 0;
beforeEach(() => {
  mesures = 0;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.hasAttribute("data-frise")) mesures++;
    const n = (k: string) => Number(this.getAttribute(k) ?? 0);
    const top = n("data-top");
    const left = n("data-left");
    const height = n("data-h") || 20;
    return { top, bottom: top + height, left, right: left + 12, width: 12, height, x: left, y: top, toJSON: () => ({}) };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Frise({ onLayout, version }: { onLayout: (l: TimelineLayout) => void; version: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const layout = useTimelineLayout(ref, version);
  onLayout(layout);
  return (
    <div ref={ref} data-frise data-top="100" data-left="0" data-h="800">
      <li data-room-id="a" data-top="140">
        <span data-testid="timeline-ring" data-left="20" />
        <button data-title-start data-left="56">Prologue</button>
      </li>
      <li data-journal-id="j" data-top="180" />
      <li data-event-id="e" data-top="220" />
      <li data-event-end-id="e" data-top="400" />
    </div>
  );
}

describe("measureTimeline", () => {
  it("relève en une passe chaque ligne (la fin d'un événement sous « id:end »), le fil, le début des titres", () => {
    let layout: TimelineLayout | null = null;
    render(<Frise version="v" onLayout={(l) => { layout = l; }} />);
    const container = document.querySelector("[data-frise]") as HTMLElement;
    const r = measureTimeline(container);
    expect([...r.rows.entries()]).toEqual([
      ["a", { top: 40, height: 20 }],
      ["j", { top: 80, height: 20 }],
      ["e", { top: 120, height: 20 }],
      ["e:end", { top: 300, height: 20 }],
    ]);
    // Le fil : le centre de l'anneau (20 + 12/2).
    expect(r.filX).toBe(26);
    expect(r.titleX).toBe(56);
    expect(r.height).toBe(800);
    expect(layout!.rows.size).toBe(4);
  });
});

describe("useTimelineLayout", () => {
  it("remesure quand sa clé change, pas à chaque rendu", () => {
    const onLayout = vi.fn();
    const { rerender } = render(<Frise version="v1" onLayout={onLayout} />);
    const apresMontage = mesures;
    rerender(<Frise version="v1" onLayout={onLayout} />);
    expect(mesures).toBe(apresMontage);
    rerender(<Frise version="v2" onLayout={onLayout} />);
    expect(mesures).toBe(apresMontage + 1);
  });

  it("au redimensionnement, une mesure par image au plus", () => {
    let signaler: () => void = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(cb: () => void) { signaler = cb; }
      observe() {}
      disconnect() {}
    });
    const images: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { images.push(cb); return images.length; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    render(<Frise version="v" onLayout={() => {}} />);
    const avant = mesures;
    // Trois changements de taille dans la même image : une seule mesure.
    signaler(); signaler(); signaler();
    expect(images).toHaveLength(1);
    act(() => images[0](0));
    expect(mesures).toBe(avant + 1);
  });
});
