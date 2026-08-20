import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorldTimelineConfig } from "@/types/worlds";

import { WorldTimelineShortcutsWidget } from "@/components/worlds/home/widgets/WorldTimelineShortcutsWidget";

const CONFIG: WorldTimelineConfig = {
  year_label: "An",
  era_name: null,
  month_names: ["Janvier", "Février", "Mars"],
  current_year: 1,
  current_month: 0,
  days_per_month: [5, 5, 5],
};

describe("WorldTimelineShortcutsWidget", () => {
  it("n'affiche rien quand la chronologie n'est pas activée pour ce monde", () => {
    const { container } = render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[{ id: "r1", title: "Prologue", name: null, icon_url: null, timeline_date: { year: 1, month: null, day: null } }]}
        config={undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("n'affiche rien quand aucun salon n'a de date fictive", () => {
    const { container } = render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[{ id: "r1", title: "Hors chronologie", name: null, icon_url: null, timeline_date: null }]}
        config={CONFIG}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche tous les jours du mois (days_per_month), pas seulement ceux avec une entrée", () => {
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[{ id: "a", title: "Jour 3", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 3 } }]}
        config={CONFIG}
      />,
    );
    expect(screen.getByText("Janvier, An 1")).toBeInTheDocument();
    const days = screen.getAllByRole("button", { name: /Voir les entrées du/ });
    expect(days.map((b) => b.textContent)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("sélectionne par défaut le premier jour du mois qui porte une entrée", () => {
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[
          { id: "a", title: "Jour 3", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 3 } },
          { id: "b", title: "Jour 5", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 5 } },
        ]}
        config={CONFIG}
      />,
    );
    const days = screen.getAllByRole("button", { name: /Voir les entrées du/ });
    expect(days[2]).toHaveAttribute("aria-pressed", "true"); // jour 3
    expect(days[4]).toHaveAttribute("aria-pressed", "false"); // jour 5
    expect(screen.getByText("Jour 3")).toBeInTheDocument();
    expect(screen.queryByText("Jour 5")).not.toBeInTheDocument();
  });

  it("cliquer un autre jour de la bande filtre la liste sur ce jour", async () => {
    const user = userEvent.setup();
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[
          { id: "a", title: "Jour 3", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 3 } },
          { id: "b", title: "Jour 5", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 5 } },
        ]}
        config={CONFIG}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Voir les entrées du 5 Janvier, An 1/ }));
    expect(screen.queryByText("Jour 3")).not.toBeInTheDocument();
    expect(screen.getByText("Jour 5")).toBeInTheDocument();
  });

  it("un jour sans entrée affiche un message plutôt qu'une liste vide silencieuse", async () => {
    const user = userEvent.setup();
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[{ id: "a", title: "Jour 3", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 3 } }]}
        config={CONFIG}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Voir les entrées du 1 Janvier, An 1/ }));
    expect(screen.getByText("Aucune entrée ce mois-ci.")).toBeInTheDocument();
  });

  it("naviguer au mois suivant change le mois affiché et réamorce la sélection", async () => {
    const user = userEvent.setup();
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[
          { id: "a", title: "Janvier", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 3 } },
          { id: "b", title: "Février", name: null, icon_url: null, timeline_date: { year: 1, month: 1, day: 2 } },
        ]}
        config={CONFIG}
      />,
    );
    expect(screen.getByText("Janvier, An 1")).toBeInTheDocument();
    expect(screen.getByText("Janvier")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mois suivant" }));

    expect(screen.getByText("Février, An 1")).toBeInTheDocument();
    expect(screen.queryByText("Janvier")).not.toBeInTheDocument();
    expect(screen.getByText("Février")).toBeInTheDocument();
  });

  it("chaque mois a sa propre longueur de bande de jours (days_per_month par mois, pas une valeur unique)", async () => {
    const user = userEvent.setup();
    const config: WorldTimelineConfig = { ...CONFIG, days_per_month: [2, 4, 5] };
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[{ id: "a", title: "Prologue", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 1 } }]}
        config={config}
      />,
    );
    expect(screen.getAllByRole("button", { name: /Voir les entrées du/ })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Mois suivant" }));
    expect(screen.getAllByRole("button", { name: /Voir les entrées du/ })).toHaveLength(4);
  });

  it("naviguer au mois précédent depuis le premier mois de l'année passe à l'année précédente", async () => {
    const user = userEvent.setup();
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[{ id: "a", title: "Prologue", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 1 } }]}
        config={CONFIG}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Mois précédent" }));
    expect(screen.getByText("Mars, An 0")).toBeInTheDocument();
  });

  it("retombe sur une liste chronologique simple, sans calendrier, quand le monde n'a aucun mois défini", () => {
    const noMonths: WorldTimelineConfig = { ...CONFIG, month_names: [] };
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[
          { id: "a", title: "Fondation", name: null, icon_url: null, timeline_date: { year: 1, month: null, day: null } },
          { id: "b", title: "Épilogue", name: null, icon_url: null, timeline_date: { year: 2, month: null, day: null } },
        ]}
        config={noMonths}
      />,
    );
    expect(screen.queryByRole("button", { name: /Voir les entrées du/ })).not.toBeInTheDocument();
    expect(screen.getByText("Fondation")).toBeInTheDocument();
    expect(screen.getByText("Épilogue")).toBeInTheDocument();
  });

  it("choisit le mois de la prochaine entrée à venir plutôt que le mois courant du monde", () => {
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[
          // Mois courant (0) sans aucune entrée ; la prochaine entrée est en mars (2).
          { id: "a", title: "Futur", name: null, icon_url: null, timeline_date: { year: 1, month: 2, day: 5 } },
        ]}
        config={CONFIG}
      />,
    );
    expect(screen.getByText("Mars, An 1")).toBeInTheDocument();
  });

  it("respecte la limite d'entrées listées, pour un même jour", () => {
    const rooms = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      title: `Salon ${i}`,
      name: null,
      icon_url: null,
      timeline_date: { year: 1, month: 0, day: 1 },
    }));
    render(<WorldTimelineShortcutsWidget worldId="w1" rooms={rooms} config={CONFIG} limit={3} />);
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
  });

  it("retombe sur « Conversation » quand le salon n'a ni titre ni nom", () => {
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[{ id: "r1", title: null, name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 1 } }]}
        config={CONFIG}
      />,
    );
    expect(screen.getByText("Conversation")).toBeInTheDocument();
  });

  it("le lien « voir la chronologie complète » pointe vers l'onglet Chronologie du monde", () => {
    render(
      <WorldTimelineShortcutsWidget
        worldId="w1"
        rooms={[{ id: "r1", title: "Prologue", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 1 } }]}
        config={CONFIG}
      />,
    );
    expect(screen.getByText("Voir la chronologie complète").closest("a")).toHaveAttribute(
      "href",
      "/w/w1?view=timeline",
    );
  });
});
