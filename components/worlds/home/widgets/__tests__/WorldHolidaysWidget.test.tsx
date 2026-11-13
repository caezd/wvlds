import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { WorldHolidaysWidget } from "@/components/worlds/home/widgets/WorldHolidaysWidget";
import type { WorldTimelineConfig } from "@/types/worlds";

const CONFIG: WorldTimelineConfig = {
  year_label: "Eon",
  era_name: null,
  month_names: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin"],
  current_year: 4,
  current_month: 2,
  holidays: [
    { name: "Premier de l'an", month: 0, day: 1 },
    { name: "Foire des marchands", month: 3, day: null },
    { name: "Fête des lanternes", month: 5, day: 9 },
    { name: "Jour de mars", month: 2, day: 20 },
  ],
};

describe("WorldHolidaysWidget", () => {
  it("les prochaines fêtes à partir de la date du monde, la plus proche d'abord", () => {
    render(<WorldHolidaysWidget config={CONFIG} limit={3} />);
    expect(screen.getByText("Prochaines fêtes")).toBeInTheDocument();
    const lignes = screen.getAllByRole("listitem");
    expect(lignes.map((l) => l.firstElementChild!.textContent)).toEqual(["Jour de mars", "Foire des marchands", "Fête des lanternes"]);
    // Le mois en cours : « ce mois-ci » (le monde n'a pas de jour courant).
    expect(within(lignes[0]).getByTestId("holiday-when")).toHaveTextContent("ce mois-ci");
    expect(within(lignes[1]).getByTestId("holiday-when")).toHaveTextContent("dans 1 mois");
    expect(within(lignes[2]).getByTestId("holiday-when")).toHaveTextContent("dans 3 mois");
    // Sa date telle que la frise l'écrit ; sans jour, le mois seul.
    expect(lignes[1]).toHaveTextContent("Avril, Eon 4");
    expect(lignes[2]).toHaveTextContent("9 Juin, Eon 4");
  });

  it("une fête déjà passée cette année revient l'an prochain", () => {
    render(<WorldHolidaysWidget config={CONFIG} limit={4} />);
    const derniere = screen.getAllByRole("listitem")[3];
    expect(derniere).toHaveTextContent("Premier de l'an");
    expect(derniere).toHaveTextContent("1 Janvier, Eon 5");
    expect(within(derniere).getByTestId("holiday-when")).toHaveTextContent("dans 4 mois");
  });

  it("sans fête, ou sans chronologie, il le dit", () => {
    const { unmount } = render(<WorldHolidaysWidget config={{ ...CONFIG, holidays: [] }} />);
    expect(screen.getByText("Aucune fête au calendrier.")).toBeInTheDocument();
    unmount();
    render(<WorldHolidaysWidget config={undefined} />);
    expect(screen.getByText("Aucune fête au calendrier.")).toBeInTheDocument();
  });
});
