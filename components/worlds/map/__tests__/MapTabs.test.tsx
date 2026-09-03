import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MAX_MAPS_PER_WORLD } from "@/lib/constants";
import { MapTabs } from "@/components/worlds/map/MapTabs";
import { makeMap } from "./fixtures";

// ──────────────────────────────────────────────────────────────────────────
// Un monde n'avait droit qu'à une carte. Il en a maintenant plusieurs, en
// onglets — mais seulement quand il y a de quoi choisir : à carte unique, la
// barre disparaît et la carte reprend tout le cadre.
//
// Les rôles ARIA d'onglets promettent au clavier un comportement précis :
// flèches pour circuler, un seul onglet dans l'ordre de tabulation. Les
// annoncer sans les tenir vaudrait moins que de simples boutons.
// ──────────────────────────────────────────────────────────────────────────

const CARTES = [
  makeMap({ id: "m1", label: "Continent" }),
  makeMap({ id: "m2", label: "Capitale", sort_index: 1 }),
  makeMap({ id: "m3", label: "Donjon", sort_index: 2 }),
];

function monter({
  maps = CARTES,
  activeId = "m1",
  isEditMode = false,
  creating = false,
} = {}) {
  const onSelect = vi.fn();
  const onAdd = vi.fn();
  render(
    <MapTabs
      maps={maps}
      activeId={activeId}
      isEditMode={isEditMode}
      creating={creating}
      onSelect={onSelect}
      onAdd={onAdd}
    />,
  );
  return { onSelect, onAdd };
}

beforeEach(() => vi.clearAllMocks());

describe("MapTabs — sélection", () => {
  it("rend un onglet par carte, nommé par son libellé", () => {
    monter();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Continent",
      "Capitale",
      "Donjon",
    ]);
  });

  it("marque l'onglet actif", () => {
    monter({ activeId: "m2" });
    expect(screen.getByRole("tab", { name: "Capitale" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Continent" })).toHaveAttribute("aria-selected", "false");
  });

  it("change de carte au clic", async () => {
    const { onSelect } = monter();
    await userEvent.click(screen.getByRole("tab", { name: "Donjon" }));
    expect(onSelect).toHaveBeenCalledWith("m3");
  });

  it("nomme la carte sans libellé plutôt que de la laisser vide", () => {
    monter({ maps: [makeMap({ id: "m1", label: "   " })], activeId: "m1" });
    expect(screen.getByRole("tab", { name: "Carte" })).toBeInTheDocument();
  });
});

describe("MapTabs — clavier", () => {
  it("ne met qu'un seul onglet dans l'ordre de tabulation", async () => {
    monter({ activeId: "m2" });

    // Une tabulation entre dans la barre par l'onglet actif, pas par le premier.
    await userEvent.tab();
    expect(screen.getByRole("tab", { name: "Capitale" })).toHaveFocus();
  });

  it("circule d'un onglet à l'autre aux flèches", async () => {
    const { onSelect } = monter({ activeId: "m1" });
    await userEvent.tab();

    await userEvent.keyboard("{ArrowRight}");
    expect(onSelect).toHaveBeenLastCalledWith("m2");

    await userEvent.keyboard("{ArrowLeft}");
    expect(onSelect).toHaveBeenLastCalledWith("m3"); // boucle par la gauche
  });

  it("saute aux extrémités avec Origine et Fin", async () => {
    const { onSelect } = monter({ activeId: "m2" });
    await userEvent.tab();

    await userEvent.keyboard("{End}");
    expect(onSelect).toHaveBeenLastCalledWith("m3");

    await userEvent.keyboard("{Home}");
    expect(onSelect).toHaveBeenLastCalledWith("m1");
  });
});

describe("MapTabs — ajout", () => {
  it("ne propose d'ajouter qu'en mode édition", () => {
    monter();
    expect(screen.queryByRole("button", { name: "Ajouter une carte" })).toBeNull();

    screen.getByRole("tablist");
  });

  it("ajoute une carte", async () => {
    const { onAdd } = monter({ isEditMode: true });
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une carte" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("refuse d'aller au-delà du plafond", () => {
    const pleines = Array.from({ length: MAX_MAPS_PER_WORLD }, (_, i) =>
      makeMap({ id: `m${i}`, label: `Carte ${i}`, sort_index: i }),
    );
    monter({ maps: pleines, activeId: "m0", isEditMode: true });

    const ajouter = screen.getByRole("button", { name: "Ajouter une carte" });
    expect(ajouter).toBeDisabled();
    expect(ajouter).toHaveAttribute("title", "Dix cartes au maximum par monde.");
  });

  it("patiente pendant la création", () => {
    monter({ isEditMode: true, creating: true });
    expect(screen.getByRole("button", { name: "Ajouter une carte" })).toBeDisabled();
  });
});
