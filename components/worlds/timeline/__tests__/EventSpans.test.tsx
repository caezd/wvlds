import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { render } from "@testing-library/react";

import { EventSpans, eventSpanPad } from "@/components/worlds/timeline/EventSpans";

// jsdom ne met rien en page : la position du texte de l'événement se règle
// à la main, comme si les titres se décalaient (graphe des suites).
let textLeft = 100;
beforeEach(() => {
  textLeft = 100;
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const rect = (top: number, left: number) => ({ top, bottom: top + 20, left, right: left, width: 0, height: 20, x: left, y: top, toJSON: () => ({}) });
    if (this.hasAttribute("data-event-text")) return rect(0, textLeft);
    if (this.hasAttribute("data-event-id")) return rect(0, 0);
    if (this.hasAttribute("data-event-end-id")) return rect(200, 0);
    return original.call(this);
  });
  return () => vi.restoreAllMocks();
});

/** Une frise réduite : un événement, sa fin, et le calque des barres. */
function Frise({ version }: { version: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const ids = React.useMemo(() => ["e1"], []);
  return (
    <div ref={ref}>
      <ul>
        <li data-event-id="e1"><div data-event-text>Le siège</div></li>
        <li data-event-end-id="e1">Fin : Le siège</li>
      </ul>
      <EventSpans containerRef={ref} ids={ids} version={version} />
    </div>
  );
}

const barre = () => document.querySelector("[data-event-span='e1']")?.getAttribute("d");

/** Plusieurs événements qui se chevauchent : chacun sa ligne et sa fin. */
function Chevauchements({ onLanes }: { onLanes: (n: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const ids = React.useMemo(() => ["e1", "e2", "e3"], []);
  return (
    <div ref={ref}>
      <ul>
        {ids.map((id) => (
          <React.Fragment key={id}>
            <li data-event-id={id}><div data-event-text>{id}</div></li>
            <li data-event-end-id={id}>fin {id}</li>
          </React.Fragment>
        ))}
      </ul>
      <EventSpans containerRef={ref} ids={ids} version="v" onLanes={onLanes} />
    </div>
  );
}

describe("EventSpans", () => {
  it("des barres qui se chevauchent : un couloir chacune, 6px de l'une à l'autre vers le fil ; leur nombre est annoncé", () => {
    const onLanes = vi.fn();
    render(<Chevauchements onLanes={onLanes} />);
    const xs = ["e1", "e2", "e3"].map((id) => document.querySelector(`[data-event-span='${id}']`)!.getAttribute("d")!.split(" ")[1]);
    expect(xs).toEqual(["90", "84", "78"]);
    expect(onLanes).toHaveBeenLastCalledWith(3);
  });

  it("le décalage des titres : rien pour une barre, puis de quoi garder ~10px de part et d'autre", () => {
    expect(eventSpanPad(0)).toBe(0);
    expect(eventSpanPad(1)).toBe(0);
    expect(eventSpanPad(2)).toBe(4);
    expect(eventSpanPad(3)).toBe(10);
  });

  it("une barre de la ligne de l'événement à celle de sa fin, 10px avant le texte", () => {
    render(<Frise version="v1" />);
    expect(barre()).toBe("M 90 10 V 210");
  });

  it("se remesure quand sa clé change, pas à un simple rendu : la frise doit y mettre ce qui décale les titres", () => {
    const { rerender } = render(<Frise version="graphe:32" />);
    expect(barre()).toBe("M 90 10 V 210");
    // Les titres se décalent (place des couloirs), sans autre changement.
    textLeft = 124;
    rerender(<Frise version="graphe:32" />);
    expect(barre()).toBe("M 90 10 V 210");
    rerender(<Frise version="graphe:24" />);
    expect(barre()).toBe("M 114 10 V 210");
  });
});
