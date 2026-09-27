import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TimelineMinimap } from "@/components/worlds/timeline/TimelineMinimap";
import type { TimelineMinimapMonth, TimelineMinimapYear } from "@/lib/worldTimelineItems";
import type { WorldTimelineConfig } from "@/types/worlds";

const CONFIG: WorldTimelineConfig = {
  year_label: "Eon",
  era_name: null,
  month_names: ["Janvier", "Février", "Mars"],
  current_year: 2,
  current_month: 1,
};

const mois = (rooms: number, extra: Partial<TimelineMinimapMonth> = {}): TimelineMinimapMonth => ({
  rooms, items: rooms, hasEvent: false, arcIds: new Set(), ...extra,
});
const ANNEES: TimelineMinimapYear[] = [
  { year: 1, months: [mois(4, { arcIds: new Set(["exil"]) }), mois(0), mois(1, { hasEvent: true, items: 2 })] },
  { year: 2, months: [mois(0), mois(2), mois(0, { items: 1, hasEvent: true })] },
];

function monter(props: Partial<React.ComponentProps<typeof TimelineMinimap>> = {}) {
  const onYear = vi.fn();
  const onMonth = vi.fn();
  render(
    <TimelineMinimap
      config={CONFIG}
      years={ANNEES}
      max={4}
      current={{ year: 1, month: 2 }}
      isolatedArc={null}
      onYear={onYear}
      onMonth={onMonth}
      {...props}
    />,
  );
  return { onYear, onMonth, nav: screen.getByRole("navigation", { name: "Aperçu de la frise" }) };
}

const largeur = (b: Element) => (b.querySelector("[data-testid='timeline-minimap-bar']") as HTMLElement).style.width;

describe("TimelineMinimap", () => {
  it("une case par mois et par année ; des barres proportionnelles aux salons, au moins 20 %, nulles sans salon", () => {
    const { nav } = monter();
    const cases = within(nav).getAllByRole("button", { name: /^(Janvier|Février|Mars), Eon/ });
    expect(cases).toHaveLength(6);
    expect(cases.map(largeur)).toEqual(["100%", "0%", "25%", "0%", "50%", "0%"]);
  });

  it("une barre fait au moins 20 % : un salon sur un maximum de dix", () => {
    const { nav } = monter({ max: 10 });
    expect(largeur(within(nav).getByRole("button", { name: /^Mars, Eon 1/ }))).toBe("20%");
  });

  it("chaque case se nomme : le mois, l'année, ses salons, l'événement", () => {
    const { nav } = monter();
    expect(within(nav).getByRole("button", { name: "Mars, Eon 1 · 1 salon · événement" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Janvier, Eon 1 · 4 salons" })).toBeInTheDocument();
  });

  it("le mois lu en ce moment ressort (aria-current, barre pleine) ; son année aussi", () => {
    const { nav } = monter();
    const mars = within(nav).getByRole("button", { name: /^Mars, Eon 1/ });
    expect(mars).toHaveAttribute("aria-current", "true");
    expect(mars.querySelector("[data-testid='timeline-minimap-bar']")!.className).toContain("bg-foreground");
    expect(within(nav).getAllByRole("button").filter((b) => b.getAttribute("aria-current"))).toHaveLength(1);
    expect(within(nav).getByRole("button", { name: "Eon 1" }).className.split(" ")).toContain("text-foreground");
    expect(within(nav).getByRole("button", { name: "Eon 2" }).className.split(" ")).toContain("text-muted-foreground");
  });

  it("un trait rouge barre le mois actuel du monde ; la date du jour dans son info-bulle", () => {
    const { nav } = monter();
    const traits = within(nav).getAllByTestId("timeline-minimap-today");
    expect(traits).toHaveLength(1);
    const fevrier2 = traits[0].closest("button")!;
    expect(fevrier2).toHaveAccessibleName("Février, Eon 2 · 2 salons");
    expect(fevrier2).toHaveAttribute("title", "Février, Eon 2 · 2 salons · Aujourd’hui");
    expect(traits[0]).toHaveAttribute("aria-hidden");
  });

  it("un arc isolé teinte les mois où il a un épisode", () => {
    const { nav } = monter({ isolatedArc: { id: "exil", color: "#22c55e" } });
    const janvier = within(nav).getByRole("button", { name: /^Janvier, Eon 1/ });
    expect((janvier.querySelector("[data-testid='timeline-minimap-bar']") as HTMLElement).style.backgroundColor).toBe("rgb(34, 197, 94)");
    const fevrier2 = within(nav).getByRole("button", { name: /^Février, Eon 2/ });
    expect((fevrier2.querySelector("[data-testid='timeline-minimap-bar']") as HTMLElement).style.backgroundColor).toBe("");
  });

  it("bordée dessus, comme le bandeau de position en face ; des lignes de 10px ; elle défile pour garder le mois lu au milieu", () => {
    const props = {
      config: CONFIG, years: ANNEES, max: 4, isolatedArc: null, onYear: vi.fn(), onMonth: vi.fn(),
    };
    const { rerender } = render(<TimelineMinimap {...props} current={{ year: 1, month: 0 }} />);
    const nav = screen.getByRole("navigation", { name: "Aperçu de la frise" });
    expect(nav.className.split(" ")).toEqual(expect.arrayContaining(["border-t", "border-t-border"]));
    const mars2 = within(nav).getByRole("button", { name: /^Mars, Eon 2/ });
    expect(mars2.className.split(" ")).toEqual(expect.arrayContaining(["h-2.5", "shrink-0"]));

    const scroller = screen.getByTestId("timeline-minimap-scroller");
    expect(scroller.className.split(" ")).toContain("overflow-y-auto");
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo as never;
    Object.defineProperty(scroller, "clientHeight", { value: 100, configurable: true });
    Object.defineProperty(mars2, "offsetTop", { value: 300, configurable: true });
    Object.defineProperty(mars2, "offsetHeight", { value: 10, configurable: true });
    rerender(<TimelineMinimap {...props} current={{ year: 2, month: 2 }} />);
    // 300 − 100 / 2 + 10 / 2 : la ligne au milieu.
    expect(scrollTo).toHaveBeenCalledWith({ top: 255, behavior: "smooth" });
  });

  it("un clic mène au mois (s'il a du contenu) ou à l'année", async () => {
    const user = userEvent.setup();
    const { nav, onMonth, onYear } = monter();
    await user.click(within(nav).getByRole("button", { name: /^Mars, Eon 2/ }));
    expect(onMonth).toHaveBeenCalledWith(2, 2);
    // Un mois vide : rien.
    const vide = within(nav).getByRole("button", { name: /^Février, Eon 1/ });
    expect(vide).toHaveAttribute("aria-disabled", "true");
    await user.click(vide);
    expect(onMonth).toHaveBeenCalledTimes(1);
    await user.click(within(nav).getByRole("button", { name: "Eon 1" }));
    expect(onYear).toHaveBeenCalledWith(1);
  });
});
