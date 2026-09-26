import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorldTimelineConfig } from "@/types/worlds";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { WorldTimeline } from "@/components/worlds/timeline/WorldTimeline";

const CONFIG: WorldTimelineConfig = {
  year_label: "An",
  era_name: null,
  month_names: ["Janvier", "Février", "Mars"],
  current_year: 1,
  current_month: 1,
};

type Room = React.ComponentProps<typeof WorldTimeline>["rooms"][number];
const room = (id: string, title: string | null, year: number, month: number | null, day: number | null): Room => ({
  id, title, name: null, icon_url: null, timeline_date: { year, month, day },
});

function frise(rooms: Room[], config = CONFIG) {
  return render(<WorldTimeline worldId="w1" rooms={rooms} config={config} onClose={vi.fn()} />);
}

const annees = () => screen.getAllByRole("heading", { level: 3 });

describe("WorldTimeline — frise verticale", () => {
  it("affiche « Chronologie » dans l'en-tête", () => {
    frise([]);
    expect(screen.getByText("Chronologie")).toBeInTheDocument();
  });

  it("affiche un message quand aucune conversation n'est encore située", () => {
    frise([]);
    expect(screen.getByText(/Aucune conversation/)).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-now")).toBeNull();
  });

  it("une section par année, dans l'ordre, les salons triés par mois puis jour", () => {
    frise([room("c", "Retour", 3, 0, 4), room("b", "Suite", 1, 2, 2), room("a", "Prologue", 1, 0, 9)]);

    expect(annees().map((h) => h.textContent)).toEqual(["1An", "3An"]);
    const an1 = annees()[0].closest("li")!;
    const titres = within(an1).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(titres).toEqual(["Prologue, 9 Janvier, An 1", "Suite, 2 Mars, An 1"]);
  });

  it("la date s'écrit jour et mois devant le titre", () => {
    frise([room("a", "Prologue", 1, 1, 19)]);
    const ligne = screen.getByRole("button", { name: /Prologue/ });
    expect(ligne).toHaveTextContent("19 Février");
  });

  it("l'année en très grands chiffres, sa légende en exposant, sans rouge", () => {
    frise([room("a", "Prologue", 1, 0, 1)], { ...CONFIG, era_name: "des Cendres" });
    const an1 = annees()[0];
    expect(within(an1).getByText("1").className).toMatch(/text-4xl.*sm:text-6xl/);
    const legende = within(an1).getByText("An des Cendres").className;
    expect(legende).toContain("text-muted-foreground");
    expect(legende).not.toMatch(/accent|red/);
  });

  it("des filets de la couleur des bordures, sans le tout premier", () => {
    frise([room("a", "Avant", 0, 0, 1), room("b", "Après", 1, 0, 1)]);
    const sections = annees().map((h) => h.closest("li")!);
    for (const s of sections) {
      expect(s.className.split(" ")).toContain("border-t");
      expect(s.className.split(" ")).toContain("border-border");
      expect(s.className).toContain("first:border-t-0");
    }
  });

  it("un filet sépare chaque mois d'une année, pas les salons d'un même mois", () => {
    frise([
      room("a", "Six janvier", 1, 0, 6),
      room("b", "Neuf janvier", 1, 0, 9),
      room("c", "Trois mars", 1, 2, 3),
      room("d", "Autre année", 2, 0, 1),
    ]);
    const ligne = (nom: string) => screen.getByRole("button", { name: new RegExp(nom) }).closest("li")!;
    // Le premier salon de l'année n'en a pas : le filet de l'année suffit.
    expect(ligne("Six janvier")).not.toHaveAttribute("data-new-month");
    expect(ligne("Neuf janvier")).not.toHaveAttribute("data-new-month");
    expect(ligne("Trois mars")).toHaveAttribute("data-new-month", "true");
    expect(ligne("Trois mars").querySelector(".h-px.bg-border")).not.toBeNull();
    // Le nom du nouveau mois, en petit, à gauche du fil — un seul ici.
    expect(screen.getAllByTestId("timeline-month-label").map((l) => l.textContent)).toEqual(["Mars"]);
    expect(ligne("Autre année")).not.toHaveAttribute("data-new-month");
  });

  it("le jour et le mois de chaque salon, sans couleur d'accent", () => {
    frise([room("a", "Prologue", 1, 1, 19)]);
    const ligne = screen.getByRole("button", { name: /Prologue/ });
    expect(ligne.innerHTML).not.toMatch(/accent|red-600/);
  });

  it("la date actuelle du monde se glisse parmi les salons, à son mois", () => {
    frise([room("a", "Janvier", 1, 0, 3), room("b", "Mars", 1, 2, 3)]);
    const an1 = annees()[0].closest("li")!;
    const lignes = within(an1).getAllByRole("listitem");
    expect(lignes.map((l) => l.dataset.testid ?? l.textContent)).toEqual([
      expect.stringContaining("Janvier"),
      "timeline-now",
      expect.stringContaining("Mars"),
    ]);
    const trait = screen.getByTestId("timeline-now");
    // Plus de texte visible sur la barre : seulement pour les lecteurs
    // d'écran, et au survol.
    expect(trait).toHaveAttribute("title", "Date actuelle du monde : Février, An 1");
    expect(within(trait).getByText("Date actuelle du monde : Février, An 1")).toHaveClass("sr-only");
    // Un trait rouge plein, qui déborde sur la colonne des années.
    const barre = trait.querySelector(".h-0\\.5")!;
    expect(barre.className).toContain("bg-red-600");
    expect(barre.className).toContain("-left-[7.75rem]");
  });

  it("l'année actuelle a sa section même sans salon, pour porter son repère", () => {
    frise([room("a", "Jadis", 0, 0, 1)], { ...CONFIG, current_year: 4 });
    expect(annees().map((h) => h.textContent)).toEqual(["0An", "4An"]);
    expect(screen.getByTestId("timeline-now")).toBeInTheDocument();
  });

  it("au-delà de cinq ans, des pastilles mènent à chaque tranche", async () => {
    const user = userEvent.setup();
    frise([room("a", "Début", 1, 0, 1), room("b", "Fin", 12, 0, 1)], { ...CONFIG, current_year: 12 });

    const nav = screen.getByRole("navigation", { name: "Périodes de la chronologie" });
    const pastilles = within(nav).getAllByRole("button");
    expect(pastilles.map((p) => p.textContent)).toEqual(["1 – 5", "11 – 15"]);
    // Ouverte sur l'année actuelle : sa tranche est la courante.
    expect(pastilles[1]).toHaveAttribute("aria-current", "true");

    await user.click(pastilles[0]);
    expect(pastilles[0]).toHaveAttribute("aria-current", "true");
    expect(pastilles[1]).not.toHaveAttribute("aria-current");
  });

  it("sur cinq ans ou moins, pas de pastilles", () => {
    frise([room("a", "Début", 1, 0, 1), room("b", "Fin", 3, 0, 1)]);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("ouvrir un salon depuis la frise", async () => {
    const user = userEvent.setup();
    frise([room("a", "Prologue", 1, 0, 1)]);
    await user.click(screen.getByRole("button", { name: /Prologue/ }));
    expect(push).toHaveBeenCalledWith("/c/a");
  });
});

describe("WorldTimeline — lignes de salon", () => {
  it("survol discret, et un libellé par défaut sans titre", () => {
    frise([room("a", "Prologue", 1, 1, 19), room("b", null, 1, 1, null)]);

    const ligne = screen.getByRole("button", { name: /Prologue/ });
    // Une ligne basse, sans carte bordée ni fond au survol.
    expect(ligne.className).not.toMatch(/\bborder\b/);
    expect(ligne.className).not.toMatch(/hover:bg-|(^|\s)w-full\b/);
    // Atténué au repos, plein au survol : `text-primary` était presque blanc
    // en thème sombre, comme le texte, et le survol ne se voyait pas.
    const titre = within(ligne).getByText("Prologue").className;
    expect(titre).toContain("text-foreground/75");
    expect(titre).toContain("group-hover/entry:text-foreground");
    expect(titre).not.toContain("text-primary");

    // Sans titre ni jour : un libellé par défaut, pas de jour inventé.
    const sansTitre = screen.getByRole("button", { name: "Conversation, Février, An 1" });
    expect(sansTitre).toHaveTextContent("Février");
    expect(sansTitre).not.toHaveTextContent(/\d/);
  });
});
