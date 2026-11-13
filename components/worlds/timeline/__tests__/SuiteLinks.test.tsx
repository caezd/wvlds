import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { SuiteLinks, type SuiteLink } from "@/components/worlds/timeline/SuiteLinks";
import type { TimelineLayout } from "@/components/worlds/timeline/TimelineLayout";

// Un conteneur de 500px ; le rail de la première chaîne à 500 − 12 = 488.
const LAYOUT: TimelineLayout = {
  width: 500,
  height: 400,
  filX: 26,
  titleX: 56,
  rows: new Map([
    ["a", { top: 0, height: 20, textEnd: 200 }],
    ["b", { top: 40, height: 20, textEnd: 470 }],
    ["c", { top: 80, height: 20, textEnd: 150 }],
    ["d", { top: 120, height: 20, textEnd: 150 }],
  ]),
};
const ARC: SuiteLink[] = [{ from: "a", to: "b", color: "#22c55e" }];
const SANS_ARC: SuiteLink[] = [{ from: "c", to: "d", color: null }];

function calque(props: Partial<React.ComponentProps<typeof SuiteLinks>> = {}) {
  return render(
    <div className="relative">
      <SuiteLinks layout={LAYOUT} links={[...ARC, ...SANS_ARC]} style="rail" only={null} onLanes={vi.fn()} {...props} />
    </div>,
  );
}

describe("SuiteLinks — trait vers l'arc", () => {
  it("au survol d'un salon d'un arc, un pointillé de la fin du texte (+8) jusqu'avant la pastille (−5)", () => {
    calque({ hoveredRoomId: "a" });
    const traits = screen.getAllByTestId("timeline-arc-lead");
    expect(traits).toHaveLength(1);
    // Centre de la ligne : 0 + 20 / 2.
    expect(traits[0]).toHaveAttribute("d", "M 208 10 H 483");
    expect(traits[0]).toHaveAttribute("stroke-dasharray", "3 3");
    expect(traits[0]).toHaveAttribute("stroke-width", "1.5");
    expect(traits[0].style.stroke).toBe("rgb(34, 197, 94)");
    expect(traits[0].style.opacity).toBe("0.8");
    // Sa pastille grossit d'un pixel.
    const pastille = document.querySelector("circle[data-hovered]")!;
    expect(pastille).toHaveAttribute("r", "4.5");
    expect(pastille).toHaveAttribute("cy", "10");
  });

  it("rien au repos, ni pour un salon sans arc, ni en graphe", () => {
    const { rerender } = calque();
    expect(screen.queryByTestId("timeline-arc-lead")).toBeNull();
    const avec = (props: Partial<React.ComponentProps<typeof SuiteLinks>>) => (
      <div className="relative">
        <SuiteLinks layout={LAYOUT} links={[...ARC, ...SANS_ARC]} style="rail" only={null} onLanes={vi.fn()} {...props} />
      </div>
    );
    rerender(avec({ hoveredRoomId: "c" }));
    expect(screen.queryByTestId("timeline-arc-lead")).toBeNull();
    rerender(avec({ hoveredRoomId: "a", style: "graph" }));
    expect(screen.queryByTestId("timeline-arc-lead")).toBeNull();
    // La fin du survol l'efface.
    rerender(avec({ hoveredRoomId: "a" }));
    expect(screen.getByTestId("timeline-arc-lead")).toBeInTheDocument();
    rerender(avec({ hoveredRoomId: null }));
    expect(screen.queryByTestId("timeline-arc-lead")).toBeNull();
  });

  it("pas de trait quand le texte arrive à moins de 16px de la pastille ; le petit bout reste", () => {
    calque({ hoveredRoomId: "b" });
    // 488 − 5 − (470 + 8) = 5 < 16.
    expect(screen.queryByTestId("timeline-arc-lead")).toBeNull();
    expect(document.querySelector("circle[data-hovered]")).toHaveAttribute("r", "4.5");
  });
});
