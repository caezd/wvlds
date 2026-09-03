import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { PinPopover } from "@/components/worlds/map/PinPopover";
import type { MapPin } from "@/app/actions/worldMap";
import type { PinPopoverPos } from "@/components/worlds/map/types";
import { makeMap, makePin, WIKI_PAGES } from "./fixtures";

/** Deux cartes : celle du lieu, et celle qu'il peut ouvrir. */
const CARTES = [makeMap(), makeMap({ id: "map2", label: "Le donjon", sort_index: 1 })];

// ──────────────────────────────────────────────────────────────────────────
// La carte est l'index géographique d'un monde, et le wiki en est le texte :
// rien ne les reliait. Une épingle peut désormais renvoyer à la page du lieu
// qu'elle marque.
// ──────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const updateMapPin = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/app/actions/worldMap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/actions/worldMap")>()),
  updateMapPin,
  deleteMapPin: vi.fn(),
}));

// L'éditeur de paragraphe charge tout le composeur : un champ suffit ici.
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

function monter(p: MapPin, isEditMode = false, pos: PinPopoverPos = { left: 100, top: 100, placement: "above", arrowLeft: 170 }) {
  const mock = createSupabaseMock();
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const onUpdated = vi.fn();
  const onOpenMap = vi.fn();
  render(
    <PinPopover
      pin={p}
      pos={pos}
      wikiPages={WIKI_PAGES}
      maps={CARTES}
      isEditMode={isEditMode}
      worldId="w1"
      onClose={vi.fn()}
      onUpdated={onUpdated}
      onDelete={vi.fn()}
      onOpenMap={onOpenMap}
    />,
  );
  return { onUpdated, onOpenMap };
}

beforeEach(() => {
  pushMock.mockReset();
  updateMapPin.mockClear();
});

describe("PinPopover — page du wiki", () => {
  it("ouvre la page liée depuis l'épingle", async () => {
    monter(makePin({ wiki_page_id: "p1" }));

    const lien = await screen.findByRole("button", { name: /Ouvrir la page du wiki : Arkham/ });
    await userEvent.click(lien);

    expect(pushMock).toHaveBeenCalledWith("/w/w1?view=wiki&page=arkham");
  });

  it("associe une page en modifiant l'épingle", async () => {
    const { onUpdated } = monter(makePin(), true);

    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Page du wiki" }), "p2");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(updateMapPin).toHaveBeenCalledWith("pin1", expect.objectContaining({ wiki_page_id: "p2" }));
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ wiki_page_id: "p2" }));
  });

  it("ne montre aucun lien quand l'épingle n'a pas de page", async () => {
    monter(makePin());

    // Les pages arrivent ; rien n'est lié.
    await screen.findByText("Le port");
    expect(screen.queryByRole("button", { name: /Ouvrir la page du wiki/ })).toBeNull();
  });
});

describe("PinPopover — flèche vers l'épingle", () => {
  it("pointe vers le bas quand le panneau est au-dessus", () => {
    monter(makePin());

    const fleche = document.querySelector("[data-pin-caret]") as HTMLElement;
    expect(fleche).not.toBeNull();
    expect(fleche.dataset.placement).toBe("above");
    // Centrée sur l'abscisse rendue par `calcPopoverPos`, à un demi-côté près.
    expect(fleche.style.left).toBe("164px");
  });

  it("pointe vers le haut quand le panneau est en dessous", () => {
    monter(makePin(), false, { left: 100, top: 400, placement: "below", arrowLeft: 40 });

    const fleche = document.querySelector("[data-pin-caret]") as HTMLElement;
    expect(fleche.dataset.placement).toBe("below");
    expect(fleche.style.left).toBe("34px");
  });
});

describe("PinPopover — carte liée", () => {
  it("ouvre la carte que le lieu désigne", async () => {
    const { onOpenMap } = monter(makePin({ target_map_id: "map2" }));

    await userEvent.click(screen.getByRole("button", { name: /Ouvrir la carte : Le donjon/ }));

    expect(onOpenMap).toHaveBeenCalledWith("map2");
  });

  it("associe une carte en modifiant le lieu", async () => {
    const { onUpdated } = monter(makePin(), true);

    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Carte liée" }), "map2");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(updateMapPin).toHaveBeenCalledWith("pin1", expect.objectContaining({ target_map_id: "map2" }));
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ target_map_id: "map2" }));
  });

  it("ne propose pas au lieu d'ouvrir sa propre carte", async () => {
    // Le lien y serait un bouton qui ne va nulle part — et la base l'interdit.
    monter(makePin(), true);

    await userEvent.click(await screen.findByRole("button", { name: "Modifier" }));
    const choix = screen.getByRole("combobox", { name: "Carte liée" });

    expect([...choix.querySelectorAll("option")].map(o => o.textContent)).toEqual([
      "Aucune carte",
      "Le donjon",
    ]);
  });

  it("ne montre aucun lien quand le lieu ne mène nulle part", () => {
    monter(makePin());
    expect(screen.queryByRole("button", { name: /Ouvrir la carte/ })).toBeNull();
  });
});
