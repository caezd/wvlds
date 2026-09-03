import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PinMarker } from "@/components/worlds/map/PinMarker";
import { makePin } from "./fixtures";

// ──────────────────────────────────────────────────────────────────────────
// Un lieu de la carte n'était atteignable qu'à la souris : le marqueur était
// un `div` portant un `aria-label` — que les lecteurs d'écran ignorent sur un
// élément générique — et rien ne le rendait focusable. Aucune tabulation,
// aucune touche Entrée n'ouvrait quoi que ce soit.
//
// Le bouton « supprimer » vivait en outre À L'INTÉRIEUR de ce marqueur. Devenu
// bouton lui-même, le marqueur aurait imbriqué deux boutons : du HTML invalide,
// que les navigateurs défont en sortant l'un de l'autre — avec, à la clé, un
// marqueur qui n'ouvre plus rien.
// ──────────────────────────────────────────────────────────────────────────

function monter(props: Partial<React.ComponentProps<typeof PinMarker>> = {}) {
  const onPinClick = vi.fn();
  const onDelete = vi.fn();
  const imgRef = { current: null } as React.RefObject<HTMLImageElement | null>;
  render(
    <PinMarker
      pin={makePin()}
      isSelected={false}
      isEditMode={false}
      imgRef={imgRef}
      onPinClick={onPinClick}
      onDelete={onDelete}
      onMoved={vi.fn()}
      {...props}
    />,
  );
  return { onPinClick, onDelete };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PinMarker — accès au clavier", () => {
  it("expose le lieu comme un bouton nommé", () => {
    monter();
    expect(screen.getByRole("button", { name: "Le port" })).toBeInTheDocument();
  });

  it("reçoit le focus à la tabulation", async () => {
    monter();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Le port" })).toHaveFocus();
  });

  it("s'ouvre à la touche Entrée", async () => {
    const { onPinClick } = monter();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(onPinClick).toHaveBeenCalledTimes(1);
  });

  it("s'ouvre à la barre d'espace", async () => {
    const { onPinClick } = monter();
    await userEvent.tab();
    await userEvent.keyboard(" ");
    expect(onPinClick).toHaveBeenCalledTimes(1);
  });

  it("s'ouvre au clic", async () => {
    const { onPinClick } = monter();
    await userEvent.click(screen.getByRole("button", { name: "Le port" }));
    expect(onPinClick).toHaveBeenCalledTimes(1);
  });
});

describe("PinMarker — bouton de suppression", () => {
  it("n'est pas imbriqué dans le marqueur", () => {
    monter({ isEditMode: true });
    const marqueur = screen.getByRole("button", { name: "Le port" });
    const supprimer = screen.getByRole("button", { name: "Supprimer ce pin" });
    expect(marqueur.contains(supprimer)).toBe(false);
  });

  it("supprime sans ouvrir le lieu", async () => {
    const { onPinClick, onDelete } = monter({ isEditMode: true });
    await userEvent.click(screen.getByRole("button", { name: "Supprimer ce pin" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onPinClick).not.toHaveBeenCalled();
  });

  it("reste absent hors mode édition", () => {
    monter();
    expect(screen.queryByRole("button", { name: "Supprimer ce pin" })).toBeNull();
  });
});

describe("PinMarker — lieu qui mène ailleurs", () => {
  it("le signale d'un repère", () => {
    // Sans repère, personne ne clique pour vérifier si un lieu ouvre une autre
    // carte.
    monter({ pin: makePin({ target_map_id: "map2" }) });
    expect(document.querySelector('[title="Ce lieu mène à une autre carte"]')).not.toBeNull();
  });

  it("ne met aucun repère à un lieu ordinaire", () => {
    monter();
    expect(document.querySelector('[title="Ce lieu mène à une autre carte"]')).toBeNull();
  });
});
