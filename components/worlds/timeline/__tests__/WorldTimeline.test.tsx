import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { WorldTimelineConfig } from "@/types/worlds";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { WorldTimeline } from "@/components/worlds/timeline/WorldTimeline";

const CONFIG: WorldTimelineConfig = {
  year_label: "An",
  era_name: null,
  month_names: ["Janvier", "Février"],
  current_year: 1,
  current_month: 0,
};

describe("WorldTimeline", () => {
  it("affiche l'icône Chronologie dans l'en-tête", () => {
    render(
      <WorldTimeline worldId="w1" rooms={[]} config={CONFIG} onClose={vi.fn()} />,
    );
    expect(screen.getByText("Chronologie")).toBeInTheDocument();
  });

  it("regroupe les salons par mois à l'intérieur d'une même année", () => {
    render(
      <WorldTimeline
        worldId="w1"
        rooms={[
          { id: "a", title: "Prologue", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 1 } },
          { id: "b", title: "Suite", name: null, icon_url: null, timeline_date: { year: 1, month: 1, day: 2 } },
        ]}
        config={CONFIG}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Janvier")).toBeInTheDocument();
    expect(screen.getByText("Février")).toBeInTheDocument();
    expect(screen.getByText("Prologue")).toBeInTheDocument();
    expect(screen.getByText("Suite")).toBeInTheDocument();
  });

  it("pose une puce reliée à la ligne de l'année à côté de chaque titre de mois", () => {
    const { container } = render(
      <WorldTimeline
        worldId="w1"
        rooms={[
          { id: "a", title: "Prologue", name: null, icon_url: null, timeline_date: { year: 1, month: 0, day: 1 } },
        ]}
        config={CONFIG}
        onClose={vi.fn()}
      />,
    );
    const monthHeading = screen.getByText("Janvier");
    const row = monthHeading.parentElement!;
    expect(row).toHaveClass("relative");
    const bullet = row.querySelector(".rounded-full.border-accent");
    expect(bullet).toBeInTheDocument();
    // Connecteur courbé (coin arrondi) reliant le fil de l'année à la puce
    // du mois — couvre exactement le pl-5 du wrapper année (mesuré en repro
    // isolée : aucun écart entre la ligne, la courbe et la puce).
    const connector = row.querySelector(".rounded-bl-lg");
    expect(connector).toBeInTheDocument();
    // La puce doit être un enfant du même wrapper "année" que la ligne
    // verticale, pas une ligne à part — c'est ça qui les « relie ».
    expect(container.querySelector(".bg-border-soft")).toBeInTheDocument();
  });

  it("n'affiche aucun titre de mois pour une date sans mois précisé", () => {
    render(
      <WorldTimeline
        worldId="w1"
        rooms={[
          { id: "a", title: "Sans mois", name: null, icon_url: null, timeline_date: { year: 1, month: null, day: null } },
        ]}
        config={CONFIG}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Sans mois")).toBeInTheDocument();
    expect(screen.queryByText("Janvier")).not.toBeInTheDocument();
  });

  it("affiche un message quand aucune conversation n'est encore située", () => {
    render(<WorldTimeline worldId="w1" rooms={[]} config={CONFIG} onClose={vi.fn()} />);
    expect(screen.getByText(/Aucune conversation/)).toBeInTheDocument();
  });
});

describe("WorldTimeline — liste compacte", () => {
  it("une ligne par salon : le jour en colonne, lu en entier par les lecteurs d'écran", () => {
    render(
      <WorldTimeline
        worldId="w1"
        rooms={[
          { id: "a", title: "Prologue", name: null, icon_url: null, timeline_date: { year: 1, month: 1, day: 19 } },
          { id: "b", title: null, name: null, icon_url: null, timeline_date: { year: 1, month: 1, day: null } },
        ]}
        config={CONFIG}
        onClose={vi.fn()}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    const ligne = screen.getByRole("button", { name: /Prologue/ });
    expect(ligne).toHaveTextContent("19");
    expect(ligne).toHaveAccessibleName("Prologue, Jour 19");
    // Plus de carte bordée : une ligne basse.
    expect(ligne.className).not.toMatch(/\bborder\b/);
    expect(ligne.className).toMatch(/\bpy-1\b/);
    // Survol discret : ni fond ni pleine largeur, seul le titre change de couleur.
    expect(ligne.className).not.toMatch(/hover:bg-|(^|\s)w-full\b/);
    expect(within(ligne).getByText("Prologue").className).toContain("group-hover:text-primary");

    // Sans titre ni jour : un libellé par défaut, pas de jour inventé.
    const sansTitre = screen.getByRole("button", { name: "Conversation" });
    expect(sansTitre).not.toHaveTextContent(/\d/);
  });
});
