import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { render } from "@testing-library/react";

import { EventSpans, eventSpanPad, type EventSpan } from "@/components/worlds/timeline/EventSpans";

// jsdom ne met rien en page : la position du texte de l'événement se règle
// à la main, comme si les titres se décalaient (graphe des suites) ; la
// frise rendue fait 500px de haut.
let textLeft = 100;
beforeEach(() => {
  textLeft = 100;
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const rect = (top: number, left: number, height = 20) => ({ top, bottom: top + height, left, right: left, width: 0, height, x: left, y: top, toJSON: () => ({}) });
    if (this.hasAttribute("data-title-start")) return rect(0, textLeft);
    if (this.hasAttribute("data-event-id")) return rect(0, 0);
    if (this.hasAttribute("data-event-end-id")) return rect(200, 0);
    if (this.hasAttribute("data-frise")) return rect(0, 0, 500);
    return original.call(this);
  });
  return () => vi.restoreAllMocks();
});

/** Une frise réduite : les lignes rendues, et le calque des barres. */
function Frise({ spans, version = "v", onLanes, start = true, end = true }: {
  spans: EventSpan[];
  version?: string;
  onLanes?: (n: number) => void;
  /** La ligne de l'événement, celle de sa fin : rendues ou non. */
  start?: boolean;
  end?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} data-frise>
      <ul>
        {spans.map(({ id }) => (
          <React.Fragment key={id}>
            {start && <li data-event-id={id}><div data-title-start>{id}</div></li>}
            {end && <li data-event-end-id={id}><p data-title-start>fin {id}</p></li>}
          </React.Fragment>
        ))}
        {!start && !end && <li><button data-title-start>un salon</button></li>}
      </ul>
      <EventSpans containerRef={ref} spans={spans} version={version} onLanes={onLanes} />
    </div>
  );
}

const entier = (id: string): EventSpan => ({ id, clipTop: false, clipBottom: false });
const barre = (id = "e1") => document.querySelector(`[data-event-span='${id}']`)?.getAttribute("d");

describe("EventSpans", () => {
  it("une barre de la ligne de l'événement à celle de sa fin, 10px avant le texte", () => {
    render(<Frise spans={[entier("e1")]} />);
    expect(barre()).toBe("M 90 10 V 210");
  });

  it("un bout hors de ce qui est rendu : la barre file jusqu'au bord", () => {
    const { unmount } = render(<Frise spans={[{ id: "e1", clipTop: true, clipBottom: false }]} start={false} />);
    expect(barre()).toBe("M 90 0 V 210");
    unmount();
    render(<Frise spans={[{ id: "e1", clipTop: false, clipBottom: true }]} end={false} />);
    expect(barre()).toBe("M 90 10 V 500");
  });

  it("les deux bouts hors champ : de haut en bas, calée sur les titres rendus", () => {
    render(<Frise spans={[{ id: "e1", clipTop: true, clipBottom: true }]} start={false} end={false} />);
    expect(barre()).toBe("M 90 0 V 500");
  });

  it("une ligne attendue mais absente : pas de barre", () => {
    render(<Frise spans={[entier("e1")]} end={false} />);
    expect(barre()).toBeUndefined();
  });

  it("des barres qui se chevauchent : un couloir chacune, 6px de l'une à l'autre vers le fil ; leur nombre est annoncé", () => {
    const onLanes = vi.fn();
    render(<Frise spans={["e1", "e2", "e3"].map(entier)} onLanes={onLanes} />);
    expect(["e1", "e2", "e3"].map((id) => barre(id)!.split(" ")[1])).toEqual(["90", "84", "78"]);
    expect(onLanes).toHaveBeenLastCalledWith(3);
  });

  it("le décalage des titres : rien pour une barre, puis de quoi garder ~10px de part et d'autre", () => {
    expect(eventSpanPad(0)).toBe(0);
    expect(eventSpanPad(1)).toBe(0);
    expect(eventSpanPad(2)).toBe(4);
    expect(eventSpanPad(3)).toBe(10);
  });

  it("se remesure quand sa clé change, pas à un simple rendu : la frise doit y mettre ce qui décale les titres", () => {
    const spans = [entier("e1")];
    const { rerender } = render(<Frise spans={spans} version="graphe:32" />);
    expect(barre()).toBe("M 90 10 V 210");
    // Les titres se décalent (place des couloirs), sans autre changement.
    textLeft = 124;
    rerender(<Frise spans={spans} version="graphe:32" />);
    expect(barre()).toBe("M 90 10 V 210");
    rerender(<Frise spans={spans} version="graphe:24" />);
    expect(barre()).toBe("M 114 10 V 210");
  });
});
