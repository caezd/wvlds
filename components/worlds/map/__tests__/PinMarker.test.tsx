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
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({ id: "pin1" }));
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


describe("PinMarker — hors de son époque", () => {
  it("s'estompe sans disparaître", () => {
    // On voit qu'un lieu a existé, ou existera — et il reste ouvrable.
    const { onPinClick } = monter({ outOfTime: true });
    const marqueur = document.querySelector("[data-out-of-time]")!;
    expect(marqueur).toHaveClass("opacity-30");
    expect(marqueur).toHaveAttribute("title", "N’existe pas à cette époque");
    screen.getByRole("button", { name: "Le port" }).click();
    expect(onPinClick).toHaveBeenCalled();
  });

  it("n'a rien de particulier à son époque", () => {
    monter();
    expect(document.querySelector("[data-out-of-time]")).toBeNull();
  });
});

describe("PinMarker — le nom du lieu", () => {
  it("se lit sans qu'on ait à survoler", () => {
    // Une carte de cinquante lieux ne se lisait qu'à la souris, un par un —
    // et pas du tout au doigt.
    monter();

    const etiquette = screen.getByText("Le port");
    expect(etiquette).toBeVisible();
    expect(etiquette.className).not.toContain("opacity-0");
  });

  it("ne se fait pas annoncer deux fois", () => {
    // Le bouton porte déjà ce nom en `aria-label`.
    monter();
    expect(screen.getByText("Le port")).toHaveAttribute("aria-hidden", "true");
  });

  it("se distingue quand le lieu est ouvert", () => {
    monter({ isSelected: true });
    expect(screen.getByText("Le port").className).toContain("bg-primary");
  });

  it("borne les noms longs plutôt que de barrer la carte", () => {
    monter({ pin: makePin({ title: "La citadelle des vents du nord" }) });
    const etiquette = screen.getByText("La citadelle des vents du nord");
    expect(etiquette.className).toContain("truncate");
    expect(etiquette.className).toContain("max-w-40");
  });
});

describe("PinMarker — un nom qui en gênerait un autre", () => {
  it("se tait quand la carte le lui demande", () => {
    monter({ showLabel: false });
    expect(screen.queryByText("Le port")).toBeNull();
  });

  it("laisse le lieu atteignable pour autant", () => {
    // Le nom disparaît, pas le lieu : le bouton le porte toujours.
    const { onPinClick } = monter({ showLabel: false });
    screen.getByRole("button", { name: "Le port" }).click();
    expect(onPinClick).toHaveBeenCalled();
  });
});
