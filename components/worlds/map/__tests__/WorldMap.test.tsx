import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock, type SupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { WorldMap } from "@/components/worlds/map/WorldMap";
import { deleteMapPin, updateWorldMap } from "@/app/actions/worldMap";
import { MEDIA } from "@/hooks/useMediaQuery";
import { makeMap, makePin, makeRegion } from "./fixtures";

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
const createMapRegion = vi.hoisted(() => vi.fn());
const updateMapRegion = vi.hoisted(() => vi.fn(async () => {}));
const deleteMapRegion = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/app/actions/worldMap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/actions/worldMap")>()),
  getWorldMaps,
  createMapRegion,
  updateMapRegion,
  deleteMapRegion,
  createMapPin: vi.fn(),
  updateMapPin: vi.fn(async () => {}),
  deleteMapPin: vi.fn(async () => {}),
  createWorldMap: vi.fn(),
  updateWorldMap: vi.fn(),
  deleteWorldMap: vi.fn(async () => {}),
}));

// Le panneau d'un lieu tire tout l'éditeur de paragraphe et le rendu Markdown :
// ce qui se vérifie ici est ce que la CARTE fait, pas ce qu'il affiche.
vi.mock("@/components/worlds/map/PinDetail", () => ({
  PinDetail: ({ pin, region, onDelete }: {
    pin: { title: string };
    region?: { label: string } | null;
    onDelete: () => void;
  }) => (
    <div data-testid="pin-popover">
      {pin.title}
      {region && <span data-testid="pin-region">{region.label}</span>}
      <button type="button" onClick={onDelete}>Supprimer depuis le panneau</button>
    </div>
  ),
}));

vi.mock("@/components/worlds/map/RegionPanel", () => ({
  RegionPanel: ({ region, onDelete }: { region: { id: string; label: string }; onDelete: (r: unknown) => void }) => (
    <div data-testid="region-panel">
      {region.label}
      <button type="button" onClick={() => onDelete(region)}>Supprimer cette région</button>
    </div>
  ),
}));

// L'icône est le seul enfant qu'un marqueur rende à chaque fois : compter ses
// rendus, c'est compter ceux des marqueurs — et donc savoir si `React.memo`
// sert à quelque chose ou n'est qu'une décoration.
const iconRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/components/ui/LazyLucideIcon", () => ({
  LazyLucideIcon: () => { iconRenders.count += 1; return null; },
}));

const CANAL = "w:w1:map";

type CarteInitiale = {
  maps: ReturnType<typeof makeMap>[];
  pins: ReturnType<typeof makePin>[];
  regions?: ReturnType<typeof makeRegion>[];
} | null;

function monter(
  initialMap: CarteInitiale,
  worldId = "w1",
  strict = false,
  adresse: { initialMapId?: string; initialPinId?: string } = {},
) {
  const mock = createSupabaseMock({ user: { id: "u1" } });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const carte = (
    <WorldMap
      worldId={worldId}
      canEdit
      initialMap={initialMap ? { regions: [], ...initialMap } : initialMap}
      {...adresse}
    />
  );
  const { rerender } = render(strict ? <StrictMode>{carte}</StrictMode> : carte);
  return {
    mock,
    /** Rejoue le rendu avec un autre monde, comme une navigation client. */
    changerDeMonde: (id: string, carte: CarteInitiale) =>
      rerender(
        <WorldMap worldId={id} canEdit initialMap={carte ? { regions: [], ...carte } : carte} />,
      ),
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
    getWorldMaps.mockResolvedValue({ maps: [makeMap()], pins: [makePin()], regions: [] });
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
  // Deux lieux ouverts l'un après l'autre : il faut la colonne, car le tiroir
  // est modal et met la carte hors de portée tant qu'il est ouvert.
  beforeEach(simulerGrandEcran);
  afterEach(restaurerEcran);

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

  it("les lit dès que la carte est à l'écran, sans attendre un clic", () => {
    // Elles étaient lues à la première ouverture d'un panneau, et arrivaient
    // donc APRÈS lui : le panneau grandissait sous les yeux, et sa position —
    // qui se calcule à partir de sa hauteur — sautait. Le prix est de trois
    // requêtes légères par visite, même sans clic.
    const { mock } = monter({ maps: [makeMap()], pins: [makePin()] });

    expect(mock.builders.filter((b) => b.table === "world_wiki_pages")).toHaveLength(1);
  });

  it("ne les lit pas pour une carte sans image : il n'y a pas de lieu à ouvrir", () => {
    const { mock } = monter({ maps: [makeMap({ image_url: null })], pins: [] });

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
/**
 * Écran large : la liste des lieux s'y montre en colonne. Par défaut, le stub
 * de `matchMedia` ne satisfait aucune requête — c'est donc le tiroir qui rend,
 * comme sur un téléphone.
 */
const vraiMatchMedia = window.matchMedia;
function simulerGrandEcran() {
  window.matchMedia = ((query: string) => ({
    matches: query === MEDIA.lg,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
function restaurerEcran() {
  window.matchMedia = vraiMatchMedia;
}

/** Dimensions du cadre, modifiables en cours de test. */
const cadre = { width: 800, height: 600 };

/** Rappels des `ResizeObserver` en vie — jsdom n'en fournit aucun. */
let redimensionnements: (() => void)[] = [];

class FauxResizeObserver {
  constructor(private rappel: () => void) { redimensionnements.push(rappel); }
  observe() {}
  disconnect() { redimensionnements = redimensionnements.filter((r) => r !== this.rappel); }
}

/** Rejoue ce que le navigateur ferait après un changement de taille du cadre. */
function redimensionnerLeCadre(width: number, height = cadre.height) {
  cadre.width = width;
  cadre.height = height;
  act(() => { redimensionnements.forEach((r) => r()); });
}

function simulerMiseEnPage() {
  cadre.width = 800;
  cadre.height = 600;
  redimensionnements = [];
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FauxResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => cadre.width });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => cadre.height });
  Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, value: true });
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, value: 2000 });
  Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", { configurable: true, value: 1000 });
}

function restaurerMiseEnPage() {
  redimensionnements = [];
  delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
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

describe("WorldMap — la liste des lieux, en colonne", () => {
  const DEUX_CARTES = {
    maps: [makeMap(), makeMap({ id: "map2", label: "Le donjon", sort_index: 1 })],
    pins: [makePin(), makePin({ id: "pin2", map_id: "map2", title: "La salle du trône" })],
  };

  beforeEach(() => { simulerMiseEnPage(); simulerGrandEcran(); });
  afterEach(() => { restaurerMiseEnPage(); restaurerEcran(); });

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

describe("WorldMap — le cadre change de largeur", () => {
  beforeEach(simulerMiseEnPage);
  afterEach(restaurerMiseEnPage);

  it("recadre la carte quand sa taille ajustée, elle, ne bouge pas", async () => {
    // Le cas signalé : fermer le panneau des lieux élargit le cadre. Une carte
    // 2:1 dans un cadre 800×600 est commandée par la HAUTEUR — elle mesure
    // 1200×600 —, et l'élargir jusqu'à 1200 ne change donc pas sa taille d'un
    // pixel. L'effet qui surveille cette taille ne se déclenche pas, et sans
    // rattrapage la carte restait décalée de 200 px, panneau de lieu compris.
    monter({ maps: [makeMap()], pins: [makePin()] });
    const enveloppe = screen.getByAltText("Carte du monde").parentElement!;

    await waitFor(() => expect(enveloppe.style.transform).toBe("translate(-200px, 0px) scale(1)"));
    const tailleAvant = enveloppe.style.width;

    redimensionnerLeCadre(1200);

    // La carte fait toujours 1200 de large ; c'est le cadre qui l'a rejointe,
    // et elle doit s'y recentrer.
    await waitFor(() => expect(enveloppe.style.transform).toBe("translate(0px, 0px) scale(1)"));
    expect(enveloppe.style.width).toBe(tailleAvant);
  });

  it("suit aussi quand la taille ajustée change", async () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    const enveloppe = screen.getByAltText("Carte du monde").parentElement!;

    await waitFor(() => expect(enveloppe.style.width).toBe("1200px"));

    // Cadre plus haut : la largeur commande désormais, et la carte grandit.
    redimensionnerLeCadre(1600, 600);

    await waitFor(() => expect(enveloppe.style.width).toBe("1600px"));
  });
});

describe("WorldMap — Échap", () => {
  const DEUX = {
    maps: [makeMap()],
    pins: [makePin()],
  };

  beforeEach(() => { simulerMiseEnPage(); simulerGrandEcran(); });
  afterEach(() => { restaurerMiseEnPage(); restaurerEcran(); });

  it("referme la colonne des lieux", async () => {
    // Le tiroir, lui, s'en charge tout seul — c'est l'un des services qu'on
    // vient chercher en l'employant.
    monter(DEUX);
    await userEvent.click(screen.getByRole("button", { name: "Afficher les lieux" }));
    expect(screen.getByRole("complementary", { name: "Lieux" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("complementary", { name: "Lieux" })).toBeNull();
  });

  it("referme d'abord le lieu ouvert, la liste ensuite", async () => {
    // Un cran à la fois : refermer les deux d'un coup ferait perdre la liste à
    // qui voulait seulement quitter un lieu.
    monter(DEUX);
    await userEvent.click(screen.getByRole("button", { name: "Afficher les lieux" }));
    // Depuis la liste : le lieu porte aussi un marqueur sur la carte, et les
    // deux répondent au même nom.
    const liste = screen.getByRole("complementary", { name: "Lieux" });
    await userEvent.click(within(liste).getByRole("button", { name: /Le port/ }));
    expect(screen.getByTestId("pin-popover")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("pin-popover")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Lieux" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "Lieux" })).toBeNull();
  });
});

describe("WorldMap — la liste des lieux, en tiroir", () => {
  const DEUX_CARTES = {
    maps: [makeMap(), makeMap({ id: "map2", label: "Le donjon", sort_index: 1 })],
    pins: [makePin(), makePin({ id: "pin2", map_id: "map2", title: "La salle du trône" })],
  };

  // Pas de `simulerGrandEcran` : c'est le cas du téléphone.
  beforeEach(simulerMiseEnPage);
  afterEach(restaurerMiseEnPage);

  it("s'ouvre en tiroir quand la colonne ne tiendrait pas", async () => {
    monter(DEUX_CARTES);

    await userEvent.click(screen.getByRole("button", { name: "Afficher les lieux" }));

    // Un dialogue, et non une colonne : le tiroir apporte le piège à focus et
    // le blocage du défilement qu'un panneau posé à la main n'avait pas.
    expect(await screen.findByRole("dialog", { name: "Lieux" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Lieux" })).toBeNull();
  });

  it("passe de la liste à la fiche du lieu choisi", async () => {
    // Le tiroir EST la colonne, sur un écran étroit : la fiche y prend la
    // place de la liste, au lieu de le faire disparaître.
    monter(DEUX_CARTES);
    await userEvent.click(screen.getByRole("button", { name: "Afficher les lieux" }));

    const tiroir = await screen.findByRole("dialog", { name: "Lieux" });
    await userEvent.click(within(tiroir).getByRole("button", { name: /Le port/ }));

    expect(await screen.findByTestId("pin-popover")).toHaveTextContent("Le port");
    const fiche = screen.getByRole("dialog", { name: "Lieu" });
    // Un seul bandeau : le retour tient lieu de titre, il n'y a pas de
    // « Lieu » écrit au-dessus d'un « ← Lieux ».
    expect(within(fiche).getAllByText("Lieux")).toHaveLength(1);
  });
});

describe("WorldMap — les marqueurs ne se re-rendent pas pour rien", () => {
  it("laisse les marqueurs tranquilles quand seul l'état de la carte change", () => {
    // `PinMarker` est mémoïsé, mais la mémoïsation ne vaut que si ses props
    // gardent leur identité. Une fermeture neuve par marqueur et par rendu
    // (`onPinClick={() => …}`) la rendait inopérante : chaque changement d'état
    // de la carte re-rendait les N marqueurs, icône comprise, exactement comme
    // sans `memo`.
    const { mock } = monter({
      maps: [makeMap()],
      pins: [makePin(), makePin({ id: "pin2", title: "La tour" })],
    });
    const avant = iconRenders.count;
    expect(avant).toBeGreaterThan(0);

    // Un changement qui ne concerne aucune épingle : le libellé de la carte,
    // mis à jour par le temps réel.
    act(() => {
      mock.channelNamed(CANAL)?.emit(
        (h) => h.type === "postgres_changes" && (h.config as { table?: string }).table === "world_maps",
        { eventType: "UPDATE", new: makeMap({ label: "Hadea, renommée" }) },
      );
    });

    expect(screen.getByText("Hadea, renommée")).toBeInTheDocument();
    expect(iconRenders.count).toBe(avant);
  });
});


describe("WorldMap — régler l'échelle", () => {
  const AVEC_ECHELLE = makeMap({ scale_width_units: 1000, scale_unit: "km" });

  // L'image fait 1000×500 à l'écran : un clic à `clientX` = 100 tombe à 10 %.
  beforeEach(() => {
    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON() {},
    } as DOMRect);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  function cadre() {
    return screen.getByAltText("Carte du monde").parentElement!.parentElement!;
  }

  async function sortirLOutil() {
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    await userEvent.click(screen.getByRole("button", { name: "Régler l'échelle" }));
  }

  it("ne s'offre qu'à qui modifie la carte", async () => {
    // Une échelle se pose une fois ; la lire se fait à la barre d'échelle.
    monter({ maps: [AVEC_ECHELLE], pins: [] });
    expect(screen.queryByRole("button", { name: "Régler l'échelle" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByRole("button", { name: "Régler l'échelle" })).toBeInTheDocument();
  });

  it("déduit l'échelle d'une distance connue", async () => {
    vi.mocked(updateWorldMap).mockResolvedValue(makeMap({ scale_width_units: 200, scale_unit: "lieues" }));
    monter({ maps: [makeMap()], pins: [] });
    await sortirLOutil();

    fireEvent.click(cadre(), { clientX: 100, clientY: 0 });
    expect(screen.getByText("Cliquez un second point, sur une distance connue")).toBeInTheDocument();
    fireEvent.click(cadre(), { clientX: 350, clientY: 0 });

    await userEvent.type(screen.getByRole("spinbutton", { name: "Cette distance fait" }), "50");
    await userEvent.type(screen.getByRole("textbox", { name: "Unité" }), "lieues{Enter}");

    // 25 % de la largeur font 50 lieues : la carte en fait 200.
    await waitFor(() =>
      expect(updateWorldMap).toHaveBeenCalledWith("map1", { scale_width_units: 200, scale_unit: "lieues" }),
    );
  });

  it("accroche le segment aux lieux, plutôt que d'ouvrir leur panneau", async () => {
    monter({ maps: [AVEC_ECHELLE], pins: [makePin({ x: 60, y: 0 })] });
    await sortirLOutil();

    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    expect(screen.queryByTestId("pin-popover")).toBeNull();
    expect(document.querySelectorAll("[data-scale-point]")).toHaveLength(1);
  });

  it("Échap efface le segment, puis range l'outil", async () => {
    monter({ maps: [AVEC_ECHELLE], pins: [] });
    await sortirLOutil();
    fireEvent.click(cadre(), { clientX: 100, clientY: 0 });
    fireEvent.click(cadre(), { clientX: 350, clientY: 0 });
    expect(document.querySelectorAll("[data-scale-point]")).toHaveLength(2);

    await userEvent.keyboard("{Escape}");
    expect(document.querySelectorAll("[data-scale-point]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Régler l'échelle" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Régler l'échelle" })).toHaveAttribute("aria-pressed", "false");
  });

  it("range l'outil quand on quitte l'écriture", async () => {
    monter({ maps: [AVEC_ECHELLE], pins: [] });
    await sortirLOutil();
    fireEvent.click(cadre(), { clientX: 100, clientY: 0 });

    await userEvent.click(screen.getByRole("button", { name: "Modification active" }));

    expect(document.querySelectorAll("[data-scale-point]")).toHaveLength(0);
    fireEvent.click(cadre(), { clientX: 500, clientY: 200 });
    expect(document.querySelectorAll("[data-scale-point]")).toHaveLength(0);
  });
});

describe("WorldMap — la barre d'échelle", () => {
  beforeEach(simulerMiseEnPage);
  afterEach(restaurerMiseEnPage);

  it("montre un nombre rond d'unités, une fois la carte posée", async () => {
    // 2000×1000 dans 800×600 : la carte fait 1 200 px de large, pour 1 000 km.
    // 1,2 px par km : 100 km font 120 px.
    monter({ maps: [makeMap({ scale_width_units: 1000, scale_unit: "km" })], pins: [] });
    const barre = await screen.findByRole("img", { name: "Échelle : 100 km" });
    expect(barre.querySelector("[data-scale-bar]")).toHaveStyle({ width: "120px" });
  });

  it("n'apparaît pas sans échelle", () => {
    monter({ maps: [makeMap()], pins: [] });
    expect(screen.queryByRole("img", { name: /Échelle/ })).toBeNull();
  });
});

describe("WorldMap — l'époque affichée", () => {
  const CHRONO = { year_label: "An", era_name: null, month_names: [], current_year: 1000, current_month: null };
  const RUINE = makePin({ id: "pin1", title: "La ruine", exists_until: { year: 900, month: null, day: null } });
  const VILLE = makePin({ id: "pin2", title: "La ville", exists_from: { year: 1200, month: null, day: null }, x: 20 });
  const TOUJOURS = makePin({ id: "pin3", title: "Le port", x: 80 });

  function monterAvecChrono() {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    render(
      <WorldMap
        worldId="w1"
        canEdit
        timelineConfig={CHRONO}
        initialMap={{ maps: [makeMap()], pins: [RUINE, VILLE, TOUJOURS], regions: [] }}
      />,
    );
  }

  function estompes() {
    return [...document.querySelectorAll("[data-out-of-time]")].map((n) => n.querySelector("button")?.getAttribute("aria-label"));
  }

  it("ouvre sur l'année courante du monde, et estompe ce qui n'y est pas", () => {
    monterAvecChrono();
    expect(screen.getByRole("spinbutton", { name: "Époque affichée" })).toHaveValue(1000);
    // En l'an 1000 : la ruine n'est plus, la ville n'est pas encore.
    expect(estompes()).toEqual(["La ruine", "La ville"]);
  });

  it("suit l'année qu'on tape", async () => {
    monterAvecChrono();
    const annee = screen.getByRole("spinbutton", { name: "Époque affichée" });
    await userEvent.clear(annee);
    await userEvent.type(annee, "1250");
    expect(estompes()).toEqual(["La ruine"]);
  });

  it("« Toutes les époques » montre tout", async () => {
    monterAvecChrono();
    await userEvent.click(screen.getByRole("button", { name: "Toutes les époques" }));
    expect(estompes()).toEqual([]);
    expect(screen.getByRole("button", { name: "Toutes les époques" })).toHaveAttribute("aria-pressed", "true");
  });

  it("n'offre pas d'époque à un monde sans chronologie", () => {
    monter({ maps: [makeMap()], pins: [RUINE] });
    expect(screen.queryByRole("spinbutton", { name: "Époque affichée" })).toBeNull();
    expect(estompes()).toEqual([]);
  });
});

describe("WorldMap — les régions", () => {
  // L'image fait 1000×500 à l'écran : un clic à `clientX` = 100 tombe à 10 %.
  beforeEach(() => {
    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON() {},
    } as DOMRect);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  function cadre() {
    return screen.getByAltText("Carte du monde").parentElement!.parentElement!;
  }

  async function passerEnEdition() {
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
  }

  it("dessine les régions de la carte affichée, et elles seules", () => {
    monter({
      maps: [makeMap(), makeMap({ id: "map2", label: "Donjon", sort_index: 1 })],
      pins: [],
      regions: [makeRegion(), makeRegion({ id: "reg2", label: "La crypte", map_id: "map2" })],
    });
    expect(screen.getByRole("button", { name: "Le royaume" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "La crypte" })).toBeNull();
  });

  it("ouvre le panneau d'une région au clic, et le referme d'un clic sur la carte", async () => {
    monter({ maps: [makeMap()], pins: [], regions: [makeRegion()] });

    await userEvent.click(screen.getByRole("button", { name: "Le royaume" }));
    expect(screen.getByTestId("region-panel")).toHaveTextContent("Le royaume");

    fireEvent.click(cadre(), { clientX: 900, clientY: 400 });
    expect(screen.queryByTestId("region-panel")).toBeNull();
  });

  it("trace une région en trois clics et Entrée, puis la nomme", async () => {
    // Une épingle marque un point ; un royaume est une surface.
    createMapRegion.mockResolvedValue(makeRegion({ id: "reg9", label: "La marche" }));
    monter({ maps: [makeMap()], pins: [] });
    await passerEnEdition();
    await userEvent.click(screen.getByRole("button", { name: "Dessiner une région" }));

    fireEvent.click(cadre(), { clientX: 100, clientY: 50 });
    fireEvent.click(cadre(), { clientX: 500, clientY: 50 });
    fireEvent.click(cadre(), { clientX: 300, clientY: 400 });
    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(3);

    await userEvent.keyboard("{Enter}");
    await userEvent.type(screen.getByRole("textbox", { name: "Nom de la région" }), "La marche{Enter}");

    await waitFor(() =>
      expect(createMapRegion).toHaveBeenCalledWith("w1", "map1", {
        label: "La marche",
        points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 30, y: 80 }],
        color: "#22c55e",
      }),
    );
    // La région vient d'être créée : elle est dessinée, et son panneau ouvert.
    expect(await screen.findByRole("button", { name: "La marche" })).toBeInTheDocument();
    expect(screen.getByTestId("region-panel")).toHaveTextContent("La marche");
  });

  it("refuse de fermer un tracé de moins de trois sommets", async () => {
    monter({ maps: [makeMap()], pins: [] });
    await passerEnEdition();
    await userEvent.click(screen.getByRole("button", { name: "Dessiner une région" }));
    fireEvent.click(cadre(), { clientX: 100, clientY: 50 });
    fireEvent.click(cadre(), { clientX: 500, clientY: 50 });

    await userEvent.keyboard("{Enter}");

    expect(screen.queryByRole("textbox", { name: "Nom de la région" })).toBeNull();
    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(2);
  });

  it("le double-clic ferme le tracé sans compter deux fois le dernier sommet", async () => {
    monter({ maps: [makeMap()], pins: [] });
    await passerEnEdition();
    await userEvent.click(screen.getByRole("button", { name: "Dessiner une région" }));
    fireEvent.click(cadre(), { clientX: 100, clientY: 50 });
    fireEvent.click(cadre(), { clientX: 500, clientY: 50 });
    fireEvent.click(cadre(), { clientX: 300, clientY: 400 });
    // Le second clic du double-clic pose un sommet de plus, au même endroit.
    fireEvent.click(cadre(), { clientX: 300, clientY: 400 });
    fireEvent.doubleClick(cadre(), { clientX: 300, clientY: 400 });

    expect(screen.getByRole("textbox", { name: "Nom de la région" })).toBeInTheDocument();
    expect(document.querySelector("[data-region-draft]")).toBeNull();
  });

  it("Échap abandonne le tracé, puis range l'outil", async () => {
    monter({ maps: [makeMap()], pins: [] });
    await passerEnEdition();
    await userEvent.click(screen.getByRole("button", { name: "Dessiner une région" }));
    fireEvent.click(cadre(), { clientX: 100, clientY: 50 });

    await userEvent.keyboard("{Escape}");
    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Dessiner une région" })).toHaveAttribute("aria-pressed", "false");
  });

  it("déplace un sommet et l'enregistre", async () => {
    monter({ maps: [makeMap()], pins: [], regions: [makeRegion()] });
    await passerEnEdition();
    await userEvent.click(screen.getByRole("button", { name: "Le royaume" }));

    const poignee = screen.getByRole("button", { name: "Sommet 1" });
    fireEvent.pointerDown(poignee, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(poignee, { clientX: 300, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(poignee, { pointerId: 1 });

    await waitFor(() =>
      expect(updateMapRegion).toHaveBeenCalledWith("reg1", {
        points: [{ x: 30, y: 30 }, { x: 60, y: 20 }, { x: 60, y: 60 }, { x: 20, y: 60 }],
      }),
    );
  });

  it("supprime une région depuis son panneau", async () => {
    monter({ maps: [makeMap()], pins: [], regions: [makeRegion()] });
    await userEvent.click(screen.getByRole("button", { name: "Le royaume" }));
    await userEvent.click(screen.getByRole("button", { name: "Supprimer cette région" }));

    await waitFor(() => expect(deleteMapRegion).toHaveBeenCalledWith("reg1"));
    expect(screen.queryByRole("button", { name: "Le royaume" })).toBeNull();
  });

  it("voit arriver, changer et partir une région par le canal", () => {
    const { mock } = monter({ maps: [makeMap()], pins: [] });
    const emettreRegion = (payload: unknown) =>
      act(() => {
        mock.channelNamed(CANAL)?.emit(
          (h) => h.type === "postgres_changes" && (h.config as { table?: string }).table === "world_map_regions",
          payload,
        );
      });

    emettreRegion({ eventType: "INSERT", new: makeRegion() });
    expect(screen.getByRole("button", { name: "Le royaume" })).toBeInTheDocument();

    emettreRegion({ eventType: "UPDATE", new: makeRegion({ label: "L'empire" }) });
    expect(screen.getByRole("button", { name: "L'empire" })).toBeInTheDocument();

    emettreRegion({ eventType: "DELETE", old: { id: "reg1" } });
    expect(screen.queryByRole("button", { name: "L'empire" })).toBeNull();
  });

  it("range le tracé en cours quand on quitte l'écriture", async () => {
    // Il survivait à la sortie : ses boutons disparaissaient de l'en-tête,
    // mais chaque clic posait encore un sommet, sans plus rien pour fermer le
    // polygone ni l'abandonner.
    monter({ maps: [makeMap()], pins: [] });
    await passerEnEdition();
    await userEvent.click(screen.getByRole("button", { name: "Dessiner une région" }));
    fireEvent.click(cadre(), { clientX: 100, clientY: 50 });
    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Modification active" }));

    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(0);
    fireEvent.click(cadre(), { clientX: 500, clientY: 200 });
    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(0);
  });

  it("défait le dernier sommet au retour arrière", async () => {
    // Une erreur de main ne doit pas coûter le tracé entier.
    monter({ maps: [makeMap()], pins: [] });
    await passerEnEdition();
    await userEvent.click(screen.getByRole("button", { name: "Dessiner une région" }));
    fireEvent.click(cadre(), { clientX: 100, clientY: 50 });
    fireEvent.click(cadre(), { clientX: 500, clientY: 50 });
    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(2);

    await userEvent.keyboard("{Backspace}");

    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(1);
  });

  it("dit ce qui manque, puis comment fermer", async () => {
    monter({ maps: [makeMap()], pins: [] });
    await passerEnEdition();
    await userEvent.click(screen.getByRole("button", { name: "Dessiner une région" }));
    expect(screen.getByText(/Sommets : 0 sur 3/)).toBeInTheDocument();

    fireEvent.click(cadre(), { clientX: 100, clientY: 50 });
    fireEvent.click(cadre(), { clientX: 500, clientY: 50 });
    expect(screen.getByText(/Sommets : 2 sur 3/)).toBeInTheDocument();

    fireEvent.click(cadre(), { clientX: 300, clientY: 400 });
    expect(screen.getByText(/Cliquez le premier sommet pour fermer/)).toBeInTheDocument();
  });

  it("ferme le tracé quand on revient sur son premier sommet", async () => {
    createMapRegion.mockResolvedValue(makeRegion({ id: "reg9", label: "La marche" }));
    monter({ maps: [makeMap()], pins: [] });
    await passerEnEdition();
    await userEvent.click(screen.getByRole("button", { name: "Dessiner une région" }));
    fireEvent.click(cadre(), { clientX: 100, clientY: 50 });
    fireEvent.click(cadre(), { clientX: 500, clientY: 50 });
    fireEvent.click(cadre(), { clientX: 300, clientY: 400 });

    await userEvent.click(screen.getByRole("button", { name: "Fermer la région ici" }));

    expect(screen.getByRole("textbox", { name: "Nom de la région" })).toBeInTheDocument();
  });

  it("accroche le tracé aux lieux, comme la règle", async () => {
    monter({ maps: [makeMap()], pins: [makePin({ x: 60, y: 40 })] });
    await passerEnEdition();
    await userEvent.click(screen.getByRole("button", { name: "Dessiner une région" }));

    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    // Un sommet posé sur le lieu, et pas son panneau ouvert par-dessus le tracé.
    expect(document.querySelectorAll("[data-draft-vertex]")).toHaveLength(1);
    expect(screen.queryByTestId("pin-popover")).toBeNull();
  });
});

describe("WorldMap — le clic n'est pas avalé par le déplacement", () => {
  // Le cadre doit avoir des mesures pour que le geste soit suivi.
  beforeEach(simulerMiseEnPage);
  afterEach(restaurerMiseEnPage);

  let capture: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    capture = vi.fn();
    (Element.prototype as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;
  });
  afterEach(() => {
    delete (Element.prototype as unknown as { setPointerCapture?: unknown }).setPointerCapture;
  });

  it("ne s'approprie le pointeur qu'une fois la carte déplacée", () => {
    // Le navigateur envoie le `click` à l'élément qui CAPTURE le pointeur, et
    // non à celui qu'on a touché. Capturer dès le `pointerdown` volait donc
    // leur clic aux polygones des régions — seuls éléments cliquables de
    // l'enveloppe à laisser passer le geste de déplacement, pour qu'on puisse
    // déplacer la carte en les saisissant.
    monter({ maps: [makeMap()], pins: [] });
    const cadre = screen.getByAltText("Carte du monde").parentElement!.parentElement!;

    fireEvent.pointerDown(cadre, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(capture).not.toHaveBeenCalled();

    // Sous le seuil : c'est encore un clic, pas un déplacement.
    fireEvent.pointerMove(cadre, { pointerId: 1, clientX: 102, clientY: 101 });
    expect(capture).not.toHaveBeenCalled();

    fireEvent.pointerMove(cadre, { pointerId: 1, clientX: 140, clientY: 100 });
    expect(capture).toHaveBeenCalledWith(1);
  });
});


describe("WorldMap — supprimer un lieu", () => {
  it("demande confirmation avant d'effacer, depuis la croix du marqueur", async () => {
    // La croix supprimait sur un seul clic : un lieu et sa description
    // disparaissaient sans retour possible.
    monter({ maps: [makeMap()], pins: [makePin()] });
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));

    await userEvent.click(screen.getByRole("button", { name: "Supprimer ce pin" }));

    expect(deleteMapPin).not.toHaveBeenCalled();
    expect(await screen.findByText("Supprimer « Le port » ?")).toBeInTheDocument();
  });

  it("efface une fois confirmé", async () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    await userEvent.click(screen.getByRole("button", { name: "Supprimer ce pin" }));

    await userEvent.click(await screen.findByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(deleteMapPin).toHaveBeenCalledWith("pin1"));
    expect(screen.queryByRole("button", { name: "Le port" })).toBeNull();
  });

  it("renonce sans rien effacer", async () => {
    monter({ maps: [makeMap()], pins: [makePin()] });
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    await userEvent.click(screen.getByRole("button", { name: "Supprimer ce pin" }));

    await userEvent.click(await screen.findByRole("button", { name: "Annuler" }));

    expect(deleteMapPin).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Le port" })).toBeInTheDocument();
  });

  it("passe par la même confirmation depuis le panneau du lieu", async () => {
    // Deux chemins, un seul dialogue : le panneau confirmait de son côté.
    monter({ maps: [makeMap()], pins: [makePin()] });
    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    await userEvent.click(screen.getByRole("button", { name: "Supprimer depuis le panneau" }));

    expect(deleteMapPin).not.toHaveBeenCalled();
    expect(await screen.findByText("Supprimer « Le port » ?")).toBeInTheDocument();
  });
});

describe("WorldMap — le poids d'une image de carte", () => {
  /** L'espion d'envoi : `from()` rend un objet neuf, mais la même fonction. */
  function envoiDe(mock: SupabaseMock) {
    return (mock.client as unknown as {
      storage: { from: (b: string) => { upload: ReturnType<typeof vi.fn> } };
    }).storage.from("worlds").upload;
  }

  /** Un fichier dont on ne fabrique que le poids — 60 Mo en mémoire, non. */
  function choisir(megaoctets: number, type = "image/webp") {
    // Un WebP : `toWebP` le rend tel quel, sans canvas à faire tourner ici.
    const fichier = new File(["x"], "carte", { type });
    Object.defineProperty(fichier, "size", { value: megaoctets * 1024 * 1024 });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fichier] } });
  }

  it("refuse au-delà de soixante mégaoctets", async () => {
    const { mock } = monter({ maps: [makeMap()], pins: [] });
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));

    choisir(61);

    expect(envoiDe(mock)).not.toHaveBeenCalled();
  });

  it("refuse un SVG, que le stockage n'accepte pas", async () => {
    // Ces espaces sont publics et un SVG est un document exécutable : il est
    // refusé ici, avec les formats nommés, plutôt que par le stockage avec un
    // « Téléversement impossible ».
    const { mock } = monter({ maps: [makeMap()], pins: [] });
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));

    choisir(1, "image/svg+xml");

    expect(envoiDe(mock)).not.toHaveBeenCalled();
  });

  it("ne propose que les formats stockables dans la fenêtre de choix", () => {
    monter({ maps: [makeMap()], pins: [] });
    expect(document.querySelector('input[type="file"]')).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/gif,image/webp",
    );
  });

  it("accepte une carte en pleine résolution", async () => {
    // 20 Mo était le plafond : un export de carte le dépasse sans peine.
    vi.mocked(updateWorldMap).mockResolvedValue(makeMap({ image_url: "https://x/img.webp" }));
    const { mock } = monter({ maps: [makeMap()], pins: [] });
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));

    choisir(59);

    await waitFor(() => expect(envoiDe(mock)).toHaveBeenCalled());
  });
});

describe("WorldMap — un lieu s'ouvre dans la colonne", () => {
  const parametres = () => new URLSearchParams(window.location.search);

  beforeEach(() => {
    simulerMiseEnPage();
    simulerGrandEcran();
    window.history.replaceState(null, "", "/w/w1?view=map");
  });
  afterEach(() => { restaurerMiseEnPage(); restaurerEcran(); });

  it("ouvre la colonne sur la fiche, sans rien poser sur la carte", async () => {
    // La fiche flottait sur la carte : elle en masquait une partie, et sa
    // position se calculait à partir de sa propre hauteur.
    monter({ maps: [makeMap()], pins: [makePin()] });
    expect(screen.queryByTestId("pin-popover")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    const colonne = screen.getByRole("complementary", { name: "Lieux" });
    expect(within(colonne).getByTestId("pin-popover")).toHaveTextContent("Le port");
  });

  it("revient à la liste sans refermer la colonne", async () => {
    // Fermer la fiche et fermer la colonne sont deux gestes : les confondre
    // obligeait à la rouvrir pour choisir un autre lieu.
    monter({ maps: [makeMap()], pins: [makePin(), makePin({ id: "pin2", title: "La tour" })] });
    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    const colonne = screen.getByRole("complementary", { name: "Lieux" });
    await userEvent.click(within(colonne).getByRole("button", { name: "Lieux" }));

    expect(screen.queryByTestId("pin-popover")).toBeNull();
    expect(within(colonne).getByRole("button", { name: /La tour/ })).toBeInTheDocument();
    expect(parametres().get("pin")).toBeNull();
  });

  it("refermer la colonne referme la fiche", async () => {
    // Sinon la rouvrir rendrait le lieu d'avant, et l'adresse garderait un
    // lieu que personne ne voit.
    monter({ maps: [makeMap()], pins: [makePin()] });
    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    await userEvent.click(screen.getByRole("button", { name: "Masquer les lieux" }));
    await userEvent.click(screen.getByRole("button", { name: "Afficher les lieux" }));

    expect(screen.queryByTestId("pin-popover")).toBeNull();
    expect(parametres().get("pin")).toBeNull();
  });
});

describe("WorldMap — la région qui entoure un lieu", () => {
  beforeEach(() => { simulerMiseEnPage(); simulerGrandEcran(); });
  afterEach(() => { restaurerMiseEnPage(); restaurerEcran(); });

  // Le carré de `makeRegion` couvre de 20 à 60 % : le lieu par défaut est en
  // son milieu, à 50/50.
  it("dit dans quoi le lieu se trouve", async () => {
    monter({ maps: [makeMap()], pins: [makePin()], regions: [makeRegion()] });

    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    expect(screen.getByTestId("pin-region")).toHaveTextContent("Le royaume");
  });

  it("ne dit rien d'un lieu posé hors des régions", async () => {
    monter({ maps: [makeMap()], pins: [makePin({ x: 90, y: 90 })], regions: [makeRegion()] });

    await userEvent.click(screen.getByRole("button", { name: "Le port" }));

    expect(screen.queryByTestId("pin-region")).toBeNull();
  });
});
