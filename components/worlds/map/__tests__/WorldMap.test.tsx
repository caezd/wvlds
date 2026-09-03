import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock, type SupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { WorldMap } from "@/components/worlds/map/WorldMap";
import { makeMap, makePin } from "./fixtures";

// ──────────────────────────────────────────────────────────────────────────
// Trois promesses de la carte, chacune tenue en défaut avant ce fichier :
//
//   1. une épingle que l'on vient de créer n'apparaît qu'une fois — Postgres
//      renvoie l'INSERT à son auteur, qui l'avait déjà posée à l'écran ;
//   2. l'onglet ouvert d'emblée n'affiche pas de sablier — le serveur a déjà
//      la carte sous la main, le composant la redemandait après hydratation ;
//   3. les pages du wiki ne sont lues qu'une fois — chaque panneau de lieu les
//      rechargeait pour lui-même, à chaque ouverture.
// ──────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const getWorldMaps = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/worldMap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/actions/worldMap")>()),
  getWorldMaps,
  createMapPin: vi.fn(),
  updateMapPin: vi.fn(async () => {}),
  deleteMapPin: vi.fn(async () => {}),
  createWorldMap: vi.fn(),
  updateWorldMap: vi.fn(),
  deleteWorldMap: vi.fn(async () => {}),
}));

// Le panneau d'un lieu tire tout l'éditeur de paragraphe et le rendu Markdown :
// ce qui se vérifie ici est ce que la CARTE fait, pas ce qu'il affiche.
vi.mock("@/components/worlds/map/PinPopover", () => ({
  PinPopover: ({ pin }: { pin: { title: string } }) => (
    <div data-testid="pin-popover">{pin.title}</div>
  ),
}));

const CANAL = "w:w1:map";

type CarteInitiale = { maps: ReturnType<typeof makeMap>[]; pins: ReturnType<typeof makePin>[] } | null;

function monter(
  initialMap: CarteInitiale,
  worldId = "w1",
  strict = false,
  adresse: { initialMapId?: string; initialPinId?: string } = {},
) {
  const mock = createSupabaseMock({ user: { id: "u1" } });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const carte = (
    <WorldMap worldId={worldId} canEdit initialMap={initialMap} {...adresse} />
  );
  const { rerender } = render(strict ? <StrictMode>{carte}</StrictMode> : carte);
  return {
    mock,
    /** Rejoue le rendu avec un autre monde, comme une navigation client. */
    changerDeMonde: (id: string, carte: CarteInitiale) =>
      rerender(<WorldMap worldId={id} canEdit initialMap={carte} />),
  };
}

/** Déclenche un événement Postgres sur la table des épingles. */
function emettre(mock: SupabaseMock, payload: unknown) {
  act(() => {
    mock.channelNamed(CANAL)?.emit(
      (h) => h.type === "postgres_changes" && (h.config as { table?: string }).table === "world_map_pins",
      payload,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldMap — données servies par le serveur", () => {
  it("affiche la carte sans rien redemander", () => {
    monter({ maps: [makeMap()], pins: [makePin()] });

    expect(getWorldMaps).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Le port" })).toBeInTheDocument();
  });

  it("charge la carte elle-même quand l'onglet s'ouvre côté client", async () => {
    getWorldMaps.mockResolvedValue({ maps: [makeMap()], pins: [makePin()] });
    monter(null);

    expect(getWorldMaps).toHaveBeenCalledWith("w1");
    expect(await screen.findByRole("button", { name: "Le port" })).toBeInTheDocument();
  });
});

describe("WorldMap — temps réel", () => {
  it("ne pose pas deux fois l'épingle que l'on vient de créer", () => {
    const { mock } = monter({ maps: [makeMap()], pins: [makePin()] });

    // L'écho de notre propre INSERT, tel que Postgres le renvoie.
    emettre(mock, { eventType: "INSERT", new: makePin() });

    expect(screen.getAllByRole("button", { name: "Le port" })).toHaveLength(1);
  });

  it("pose l'épingle créée par quelqu'un d'autre", () => {
    const { mock } = monter({ maps: [makeMap()], pins: [makePin()] });

    emettre(mock, { eventType: "INSERT", new: makePin({ id: "pin2", title: "La tour" }) });

    expect(screen.getByRole("button", { name: "Le port" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "La tour" })).toBeInTheDocument();
  });

  it("retire l'épingle supprimée ailleurs", () => {
    const { mock } = monter({ maps: [makeMap()], pins: [makePin()] });

    emettre(mock, { eventType: "DELETE", old: { id: "pin1" } });

    expect(screen.queryByRole("button", { name: "Le port" })).toBeNull();
  });
});

describe("WorldMap — pages du wiki", () => {
  it("ne les lit qu'une fois, quel que soit le nombre de lieux ouverts", async () => {
    const { mock } = monter({
      maps: [makeMap()],
      pins: [makePin(), makePin({ id: "pin2", title: "La tour" })],
    });

    await userEvent.click(screen.getByRole("button", { name: "Le port" }));
    await userEvent.click(screen.getByRole("button", { name: "La tour" }));

    expect(screen.getByTestId("pin-popover")).toHaveTextContent("La tour");
    expect(mock.builders.filter((b) => b.table === "world_wiki_pages")).toHaveLength(1);
  });

  it("ne les lit pas tant qu'aucun lieu n'est ouvert", () => {
    const { mock } = monter({ maps: [makeMap()], pins: [makePin()] });

    expect(mock.builders.filter((b) => b.table === "world_wiki_pages")).toHaveLength(0);
  });
});

describe("WorldMap — changement de monde", () => {
  it("montre la carte du monde où l'on arrive", () => {
    const { changerDeMonde } = monter({ maps: [makeMap()], pins: [makePin()] });

    // Naviguer d'un monde à l'autre ne remonte pas le composant : ses états
    // garderaient la carte du monde quitté.
    changerDeMonde("w2", {
      maps: [makeMap({ id: "map2", world_id: "w2" })],
      pins: [makePin({ id: "pin9", world_id: "w2", map_id: "map2", title: "Le donjon" })],
    });

    expect(screen.queryByRole("button", { name: "Le port" })).toBeNull();
    expect(screen.getByRole("button", { name: "Le donjon" })).toBeInTheDocument();
  });
});

describe("WorldMap — molette", () => {
  /** Le cadre, son enveloppe transformée et l'image, tels qu'ils sont empilés. */
  function elements() {
    const image = screen.getByAltText("Carte du monde");
    const enveloppe = image.parentElement!;
    return { image, enveloppe, cadre: enveloppe.parentElement! };
  }

  it("agrandit la carte au cran de molette", async () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    const { cadre, enveloppe } = elements();

    cadre.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));

    await waitFor(() => expect(enveloppe.style.transform).toContain("scale(1.1"));
  });

  it("réduit jusqu'à l'échelle 1 et pas en deçà", async () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    const { cadre, enveloppe } = elements();

    for (let i = 0; i < 3; i++) {
      cadre.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
    }
    await waitFor(() => expect(enveloppe.style.transform).toContain("scale(1.3"));

    for (let i = 0; i < 10; i++) {
      cadre.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
    }
    await waitFor(() => expect(enveloppe.style.transform).toContain("scale(1)"));
  });

  it("remet les épingles d'aplomb par la variable CSS", async () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    const { cadre, enveloppe } = elements();

    cadre.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));

    // 1 / 1,1 — la contre-échelle des marqueurs, qui ne passe plus par un rendu.
    await waitFor(() =>
      expect(enveloppe.style.getPropertyValue("--pin-inv-scale")).toMatch(/^0\.909/),
    );
  });

  it("annule le défilement de la page", () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    const { cadre } = elements();

    const evenement = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
    cadre.dispatchEvent(evenement);

    expect(evenement.defaultPrevented).toBe(true);
  });
});

describe("WorldMap — sous le mode strict de React", () => {
  // Next.js active `reactStrictMode` par défaut : en développement, React monte
  // le composant, exécute les nettoyages d'effets, puis les remonte. C'est
  // exactement ce parcours qui a tué le zoom en vrai navigateur alors que tous
  // les tests passaient — ceux-ci ne rendaient pas en mode strict.
  it("agrandit toujours à la molette après le double montage", async () => {
    monter({ maps: [makeMap()], pins: [makePin()] }, "w1", true);

    const image = screen.getByAltText("Carte du monde");
    const enveloppe = image.parentElement!;
    const cadre = enveloppe.parentElement!;

    cadre.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));

    await waitFor(() => expect(enveloppe.style.transform).toContain("scale(1.1"));
  });
});

describe("WorldMap — ajustement de la carte au cadre", () => {
  // jsdom ne met rien en page : on lui souffle les mesures dont dépend
  // l'ajustement — un cadre de 800×600 et une carte 2:1.
  beforeEach(simulerMiseEnPage);
  afterEach(restaurerMiseEnPage);

  it("pose la carte à la plus petite taille qui couvre le cadre", () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    const enveloppe = screen.getByAltText("Carte du monde").parentElement!;

    // 2000×1000 dans 800×600 : la hauteur commande, la largeur déborde.
    expect(enveloppe.style.width).toBe("1200px");
    expect(enveloppe.style.height).toBe("600px");
  });

  it("ouvre sur le centre de la carte, sans bande vide", async () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    const enveloppe = screen.getByAltText("Carte du monde").parentElement!;

    // 1200 px de large dans un cadre de 800 : 400 débordent, 200 de chaque côté.
    await waitFor(() =>
      expect(enveloppe.style.transform).toBe("translate(-200px, 0px) scale(1)"),
    );
  });

  it("ne dézoome jamais en deçà du cadre", async () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    const enveloppe = screen.getByAltText("Carte du monde").parentElement!;
    const cadre = enveloppe.parentElement!;

    await waitFor(() => expect(enveloppe.style.transform).toContain("scale(1)"));

    // Vingt crans vers le bas : la carte ne rapetisse pas, et rien du fond
    // n'apparaît derrière elle.
    for (let i = 0; i < 20; i++) {
      cadre.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
    }

    await waitFor(() =>
      expect(enveloppe.style.transform).toBe("translate(-200px, 0px) scale(1)"),
    );
  });
});

describe("WorldMap — plusieurs cartes", () => {
  const DEUX_CARTES = {
    maps: [makeMap(), makeMap({ id: "map2", label: "Le donjon", sort_index: 1 })],
    pins: [makePin(), makePin({ id: "pin2", map_id: "map2", title: "La salle du trône" })],
  };

  it("garde la barre d'onglets cachée quand il n'y a qu'une carte", () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("montre un onglet par carte, et les lieux de la carte affichée", () => {
    monter(DEUX_CARTES);

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Le port" })).toBeInTheDocument();
    // Le lieu de l'autre carte ne déborde pas sur celle-ci — c'est tout l'objet
    // de `map_id` (migration 151).
    expect(screen.queryByRole("button", { name: "La salle du trône" })).toBeNull();
  });

  it("change de carte sans repartir chercher les épingles", async () => {
    const { mock } = monter(DEUX_CARTES);

    await userEvent.click(screen.getByRole("tab", { name: "Le donjon" }));

    expect(screen.getByRole("button", { name: "La salle du trône" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Le port" })).toBeNull();
    // Toutes les épingles ont été chargées d'un bloc : changer d'onglet ne
    // déclenche aucune requête.
    expect(mock.builders.filter((b) => b.table === "world_map_pins")).toHaveLength(0);
  });

  it("ouvre la barre en mode édition, même pour une carte seule", async () => {
    monter({ maps: [makeMap()], pins: [] });

    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));

    // C'est là que se trouve le bouton d'ajout : sans la barre, impossible de
    // créer une deuxième carte.
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter une carte" })).toBeInTheDocument();
  });

  it("ne montre pas d'onglets à un monde sans carte", async () => {
    monter({ maps: [], pins: [] });

    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Aucune carte configurée pour ce monde.")).toBeInTheDocument();
  });
});

// jsdom ne met rien en page : sans ces mesures, la carte reste à zéro et rien
// de ce qui dépend de sa taille ne peut s'observer.
function simulerMiseEnPage() {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 600 });
  Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, value: true });
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, value: 2000 });
  Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", { configurable: true, value: 1000 });
}

function restaurerMiseEnPage() {
  for (const prop of ["clientWidth", "clientHeight"]) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
  }
  for (const prop of ["complete", "naturalWidth", "naturalHeight"]) {
    delete (HTMLImageElement.prototype as unknown as Record<string, unknown>)[prop];
  }
}

describe("WorldMap — l'adresse suit ce qu'on regarde", () => {
  const DEUX_CARTES = {
    maps: [makeMap(), makeMap({ id: "map2", label: "Le donjon", sort_index: 1 })],
    pins: [makePin(), makePin({ id: "pin2", map_id: "map2", title: "La salle du trône" })],
  };

  const parametres = () => new URLSearchParams(window.location.search);

  beforeEach(() => {
    simulerMiseEnPage();
    window.history.replaceState(null, "", "/w/w1?view=map");
  });
  afterEach(restaurerMiseEnPage);

  it("écrit la carte ouverte", async () => {
    // Sans cela, un rafraîchissement ramenait à la première carte du monde, et
    // le lien partagé n'ouvrait pas ce qu'on avait sous les yeux.
    monter(DEUX_CARTES);

    await userEvent.click(screen.getByRole("tab", { name: "Le donjon" }));

    expect(parametres().get("map")).toBe("map2");
  });

  it("écrit le lieu consulté, et l'efface à la fermeture", async () => {
    monter(DEUX_CARTES);

    await userEvent.click(screen.getByRole("button", { name: "Le port" }));
    expect(parametres().get("pin")).toBe("pin1");
    expect(parametres().get("map")).toBe("map1");

    await userEvent.keyboard("{Escape}");
    expect(parametres().get("pin")).toBeNull();
  });

  it("ouvre la carte que l'adresse désigne", () => {
    monter(DEUX_CARTES, "w1", false, { initialMapId: "map2" });

    expect(screen.getByRole("button", { name: "La salle du trône" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Le port" })).toBeNull();
  });

  it("ouvre le lieu que l'adresse désigne, sur sa propre carte", async () => {
    monter(DEUX_CARTES, "w1", false, { initialPinId: "pin2" });

    // Le lieu vit sur la seconde carte : c'est elle qui s'ouvre.
    expect(await screen.findByTestId("pin-popover")).toHaveTextContent("La salle du trône");
  });

  it("retombe sur la première carte quand l'adresse désigne l'inconnu", () => {
    monter(DEUX_CARTES, "w1", false, { initialMapId: "carte-effacée" });

    expect(screen.getByRole("button", { name: "Le port" })).toBeInTheDocument();
  });
});

describe("WorldMap — la liste des lieux", () => {
  const DEUX_CARTES = {
    maps: [makeMap(), makeMap({ id: "map2", label: "Le donjon", sort_index: 1 })],
    pins: [makePin(), makePin({ id: "pin2", map_id: "map2", title: "La salle du trône" })],
  };

  beforeEach(simulerMiseEnPage);
  afterEach(restaurerMiseEnPage);

  it("s'ouvre depuis l'en-tête", async () => {
    monter(DEUX_CARTES);

    await userEvent.click(screen.getByRole("button", { name: "Afficher les lieux" }));

    expect(screen.getByRole("complementary", { name: "Lieux" })).toBeInTheDocument();
  });

  it("mène au lieu choisi, même sur une autre carte", async () => {
    // C'est la réponse à « où est ce lieu, déjà ? » : la recherche traverse
    // les cartes, et le choix bascule sur la bonne.
    monter(DEUX_CARTES);

    await userEvent.click(screen.getByRole("button", { name: "Afficher les lieux" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Rechercher un lieu" }), "trône");
    await userEvent.click(screen.getByRole("button", { name: /La salle du trône/ }));

    expect(await screen.findByTestId("pin-popover")).toHaveTextContent("La salle du trône");
  });
});
