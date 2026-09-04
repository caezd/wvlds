import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MapPlacesPanel } from "@/components/worlds/map/MapPlacesPanel";
import { makeMap, makePin } from "./fixtures";

// ──────────────────────────────────────────────────────────────────────────
// Retrouver un lieu supposait de le VOIR : promener la carte à l'œil, et — si
// le lieu était sur une autre carte — savoir laquelle. La recherche traverse
// donc toutes les cartes du monde.
//
// Sans recherche, en revanche, la liste décrit ce qu'on a sous les yeux : y
// mêler les lieux des autres cartes ferait une liste qu'on ne saurait pas lire.
// ──────────────────────────────────────────────────────────────────────────

const CARTES = [
  makeMap({ id: "m1", label: "Continent" }),
  makeMap({ id: "m2", label: "Le donjon", sort_index: 1 }),
];

const LIEUX = [
  makePin({ id: "p1", map_id: "m1", title: "Le port" }),
  makePin({ id: "p2", map_id: "m1", title: "La forêt", description: "Sombre et humide" }),
  makePin({ id: "p3", map_id: "m2", title: "La salle du trône" }),
];

function monter({ activeMapId = "m1", selectedPinId = null as string | null } = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <MapPlacesPanel
      maps={CARTES}
      pins={LIEUX}
      activeMapId={activeMapId}
      selectedPinId={selectedPinId}
      onSelect={onSelect}
      onClose={onClose}
    />,
  );
  return { onSelect, onClose };
}

beforeEach(() => vi.clearAllMocks());

describe("MapPlacesPanel — la liste", () => {
  it("ne montre que les lieux de la carte affichée", () => {
    monter();
    expect(screen.getByRole("button", { name: /Le port/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /La forêt/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /La salle du trône/ })).toBeNull();
  });

  it("marque le lieu ouvert", () => {
    monter({ selectedPinId: "p1" });
    expect(screen.getByRole("button", { name: /Le port/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /La forêt/ })).not.toHaveAttribute("aria-current");
  });

  it("mène au lieu choisi", async () => {
    const { onSelect } = monter();
    await userEvent.click(screen.getByRole("button", { name: /La forêt/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }));
  });

  it("le dit quand la carte n'a aucun lieu", () => {
    render(
      <MapPlacesPanel
        maps={CARTES}
        pins={[]}
        activeMapId="m1"
        selectedPinId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Aucun lieu sur cette carte.")).toBeInTheDocument();
  });
});

describe("MapPlacesPanel — la recherche", () => {
  it("filtre les lieux de la carte affichée", async () => {
    monter();
    await userEvent.type(screen.getByRole("textbox", { name: "Rechercher un lieu" }), "port");

    expect(screen.getByRole("button", { name: /Le port/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /La forêt/ })).toBeNull();
  });

  it("cherche aussi dans la description", async () => {
    monter();
    await userEvent.type(screen.getByRole("textbox", { name: "Rechercher un lieu" }), "humide");
    expect(screen.getByRole("button", { name: /La forêt/ })).toBeInTheDocument();
  });

  it("traverse les autres cartes, en les nommant", async () => {
    // C'est la réponse à « où est ce lieu, déjà ? ».
    monter();
    await userEvent.type(screen.getByRole("textbox", { name: "Rechercher un lieu" }), "trône");

    expect(screen.getByText("Sur d’autres cartes")).toBeInTheDocument();
    expect(screen.getByText("Le donjon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /La salle du trône/ })).toBeInTheDocument();
  });

  it("ignore la casse et les espaces autour", async () => {
    monter();
    await userEvent.type(screen.getByRole("textbox", { name: "Rechercher un lieu" }), "  LE PORT  ");
    expect(screen.getByRole("button", { name: /Le port/ })).toBeInTheDocument();
  });

  it("le dit quand rien ne correspond", async () => {
    monter();
    await userEvent.type(screen.getByRole("textbox", { name: "Rechercher un lieu" }), "atlantide");
    expect(screen.getByText("Aucun lieu ne correspond.")).toBeInTheDocument();
  });

  it("se referme", async () => {
    const { onClose } = monter();
    await userEvent.click(screen.getByRole("button", { name: "Masquer les lieux" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
