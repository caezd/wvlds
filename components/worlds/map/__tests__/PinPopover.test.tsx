import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { PinPopover } from "@/components/worlds/map/PinPopover";
import type { MapPersona, MapPin } from "@/app/actions/worldMap";
import type { PinPopoverPos, PinRoom } from "@/components/worlds/map/types";
import { makeMap, makeMapPersona, makePin, WIKI_PAGES } from "./fixtures";

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

function monter(
  p: MapPin,
  isEditMode = false,
  pos: PinPopoverPos = { left: 100, top: 100, placement: "above", arrowLeft: 170 },
  rooms: PinRoom[] = [],
  canPost = false,
  presence: { personasHere?: MapPersona[]; myPersonas?: MapPersona[] } = {},
) {
  const mock = createSupabaseMock();
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const onUpdated = vi.fn();
  const onOpenMap = vi.fn();
  const onPlacePersona = vi.fn();
  render(
    <PinPopover
      pin={p}
      pos={pos}
      wikiPages={WIKI_PAGES}
      rooms={rooms}
      maps={CARTES}
      personasHere={presence.personasHere ?? []}
      myPersonas={presence.myPersonas ?? []}
      onPlacePersona={onPlacePersona}
      isEditMode={isEditMode}
      canPost={canPost}
      worldId="w1"
      onClose={vi.fn()}
      onUpdated={onUpdated}
      onDelete={vi.fn()}
      onOpenMap={onOpenMap}
    />,
  );
  return { onUpdated, onOpenMap, onPlacePersona };
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

describe("PinPopover — ce qui se joue ici", () => {
  const SALONS: PinRoom[] = [
    { id: "c1", title: "La taverne du port", name: null, map_pin_id: "pin1" },
    { id: "c2", title: null, name: "Les quais", map_pin_id: "pin1" },
  ];

  it("liste les salons rattachés au lieu", () => {
    // Le lien existait en base depuis qu'un salon peut se situer sur la carte ;
    // seul le sens carte → salons manquait.
    monter(makePin(), false, undefined, SALONS);

    expect(screen.getByRole("button", { name: /La taverne du port/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Les quais/ })).toBeInTheDocument();
  });

  it("ouvre le salon choisi", async () => {
    monter(makePin(), false, undefined, SALONS);

    await userEvent.click(screen.getByRole("button", { name: /La taverne du port/ }));

    expect(pushMock).toHaveBeenCalledWith("/c/c1");
  });

  it("ne montre rien quand aucun salon ne s'y joue", () => {
    monter(makePin());
    expect(screen.queryByText("Ce qui s’y joue")).toBeNull();
  });
});

describe("PinPopover — jouer ici", () => {
  it("ouvre le composeur d'accueil sur ce lieu", async () => {
    // Le composeur sait situer un salon depuis longtemps ; il ne manquait que
    // le chemin depuis le lieu lui-même.
    monter(makePin(), false, undefined, [], true);

    await userEvent.click(screen.getByRole("button", { name: "Jouer ici" }));

    expect(pushMock).toHaveBeenCalledWith("/w/w1?play=pin1");
  });

  it("ne le propose pas à qui ne peut pas ouvrir de salon", () => {
    monter(makePin());
    expect(screen.queryByRole("button", { name: "Jouer ici" })).toBeNull();
  });
});

describe("PinPopover — qui est ici", () => {
  const KAEL = makeMapPersona({ id: "per1", name: "Kael", map_pin_id: "pin1" });
  const IFYR = makeMapPersona({ id: "per2", name: "Ifyr", user_id: "u2", map_pin_id: "pin1" });
  const ADRIEL = makeMapPersona({ id: "per3", name: "Adriel", map_pin_id: null });

  it("nomme ceux qui sont là", () => {
    monter(makePin(), false, undefined, [], false, { personasHere: [KAEL, IFYR] });

    expect(screen.getByText("Qui est ici")).toBeInTheDocument();
    expect(screen.getByText("Kael")).toBeInTheDocument();
    expect(screen.getByText("Ifyr")).toBeInTheDocument();
  });

  it("ne laisse partir que les miens", async () => {
    // Le persona d'un autre ne se déplace que par son propriétaire — la RLS le
    // refuserait de toute façon, autant ne pas proposer le bouton.
    const { onPlacePersona } = monter(makePin(), false, undefined, [], false, {
      personasHere: [KAEL, IFYR],
      myPersonas: [KAEL],
    });

    expect(screen.getAllByRole("button", { name: "Partir d’ici" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Partir d’ici" }));

    expect(onPlacePersona).toHaveBeenCalledWith("per1", null);
  });

  it("propose d'y poser un de mes personas qui n'y est pas", async () => {
    const { onPlacePersona } = monter(makePin(), false, undefined, [], false, {
      personasHere: [KAEL],
      myPersonas: [KAEL, ADRIEL],
    });

    const choix = screen.getByRole("combobox", { name: "Y placer un persona" });
    // Kael est déjà là : seul Adriel est proposé.
    expect([...choix.querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "Y placer un persona",
      "Adriel",
    ]);

    await userEvent.selectOptions(choix, "per3");
    expect(onPlacePersona).toHaveBeenCalledWith("per3", "pin1");
  });

  it("se tait quand personne n'est là et que je n'ai rien à y poser", () => {
    monter(makePin());
    expect(screen.queryByText("Qui est ici")).toBeNull();
  });
});

describe("PinPopover — c'est loin ?", () => {
  it("dit la distance au lieu ouvert juste avant", () => {
    render(
      <PinPopover
        pin={makePin()}
        pos={{ left: 100, top: 100, placement: "above", arrowLeft: 170 }}
        wikiPages={WIKI_PAGES}
        rooms={[]}
        maps={CARTES}
        personasHere={[]}
        myPersonas={[]}
        onPlacePersona={vi.fn()}
        distanceFrom={{ title: "La tour", distance: "250 km" }}
        isEditMode={false}
        worldId="w1"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
        onDelete={vi.fn()}
        onOpenMap={vi.fn()}
      />,
    );
    expect(screen.getByText("À 250 km de La tour")).toBeInTheDocument();
  });
});
