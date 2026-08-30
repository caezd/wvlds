import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { HOME_GRID_GAP_PRESETS, type WorldHomeGridGap, type WorldHomeGridItem } from "@/components/worlds/home/worldHomeGrid";

const setWorldHomeGridMock = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldHomeGrid: (...args: unknown[]) => setWorldHomeGridMock(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// browser-image-compression s'appuie sur un Web Worker, indisponible sous
// jsdom (la promesse ne se résout jamais sans ce mock) — voir aussi
// ChatroomSettingsSheet.test.tsx pour le même besoin.
vi.mock("@/lib/imageUtils", () => ({
  toWebP: vi.fn(async (file: File) => file),
}));

// Uploadée par le bloc bannière (voir uploadBannerImage) — non exercée par la
// plupart des tests, un stub suffit à éviter un vrai appel réseau/Supabase.
const bannerUploadMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => bannerUploadMock(...args),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/banner.webp" } }),
      }),
    },
  }),
}));

import { toast } from "sonner";
import { WorldHomeGridEditor, getContentWidth } from "@/components/worlds/home/WorldHomeGridEditor";

function Harness({
  initial,
  onPersisted,
  gap,
}: {
  initial: WorldHomeGridItem[];
  onPersisted?: () => void;
  gap?: WorldHomeGridGap;
}) {
  const [items, setItems] = React.useState(initial);
  return (
    <WorldHomeGridEditor worldId="w1" items={items} onItemsChange={setItems} onPersisted={onPersisted} gap={gap} />
  );
}

const CHATROOMS_ITEM: WorldHomeGridItem = { id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms" };
const HTML_ITEM: WorldHomeGridItem = { id: "b", type: "html", x: 0, y: 4, w: 12, html: "<p>x</p>" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getContentWidth", () => {
  /** Simule un élément mesurable : boîte englobante + styles calculés. */
  function nodeWith({ rectWidth, clientWidth }: { rectWidth: number; clientWidth: number }) {
    return {
      clientWidth,
      getBoundingClientRect: () => ({ width: rectWidth }) as DOMRect,
    } as HTMLElement;
  }

  const STYLE = {
    // Sous `box-sizing: border-box` (preflight Tailwind), `width` vaut la
    // boîte de BORDURE — c'est précisément le piège dans lequel tombe
    // `getContentWidth()` de react-grid-layout.
    width: "672px",
    borderLeftWidth: "1px",
    borderRightWidth: "1px",
    paddingLeft: "8px",
    paddingRight: "8px",
  } as CSSStyleDeclaration;

  function withStyle<T>(style: CSSStyleDeclaration, fn: () => T): T {
    const restore = window.getComputedStyle;
    window.getComputedStyle = () => style;
    try {
      return fn();
    } finally {
      window.getComputedStyle = restore;
    }
  }

  it("retire bordures ET paddings, sans se fier à `width` (faux sous box-sizing: border-box)", () => {
    // Régression : `getComputedStyle().width` renvoie ici 672 (boîte de
    // bordure). S'y fier annonçait 672px de place disponible pour 654px
    // réels — les blocs débordaient du cadre de 18px en permanence.
    expect(withStyle(STYLE, () => getContentWidth(nodeWith({ rectWidth: 672, clientWidth: 670 })))).toBe(654);
  });

  it("retombe sur clientWidth moins le padding quand la boîte englobante est à zéro (jsdom)", () => {
    expect(withStyle(STYLE, () => getContentWidth(nodeWith({ rectWidth: 0, clientWidth: 670 })))).toBe(654);
  });
});

describe("WorldHomeGridEditor", () => {
  it("place chaque bloc par grille CSS, aux coordonnées de son modèle", () => {
    // Même mécanisme que le rendu public (WorldHomeGridView) : l'éditeur
    // montre donc littéralement la disposition finale, et aucun moteur de
    // layout tiers n'a plus à être tenu synchronisé avec nos calculs.
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 4, widgetId: "categories" },
          { id: "b", type: "widget", x: 4, y: 0, w: 8, widgetId: "chatrooms" },
        ]}
      />,
    );

    const a = container.querySelector<HTMLElement>('[data-block-id="a"]')!;
    const b = container.querySelector<HTMLElement>('[data-block-id="b"]')!;
    expect(a.style.gridColumn).toBe("1 / span 4");
    expect(a.style.gridRow).toBe("1");
    expect(b.style.gridColumn).toBe("5 / span 8");
    expect(b.style.gridRow).toBe("1");
  });

  it("place un diviseur dans la gouttière, un seul par frontière entre colonnes", () => {
    // La gouttière elle-même est la zone de saisie : un point d'accroche par
    // séparation, plutôt que deux poignées de blocs voisins qui se
    // chevauchaient dans le même espace.
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 4, widgetId: "categories" },
          { id: "b", type: "widget", x: 4, y: 0, w: 8, widgetId: "chatrooms" },
        ]}
      />,
    );

    const dividers = container.querySelectorAll<HTMLElement>(".wghe-divider");
    expect(dividers).toHaveLength(1);
    // Posé dans la première colonne du bloc de droite, puis ramené d'une
    // gouttière vers la gauche pour occuper exactement l'espace entre les deux.
    expect(dividers[0].style.gridColumn).toBe("5");
    expect(dividers[0].style.gridRow).toBe("1");
  });

  it("applique le préréglage d'espacement reçu, comfortable par défaut", () => {
    const { container, rerender } = render(<Harness initial={[CHATROOMS_ITEM]} />);
    let grid = container.querySelector<HTMLElement>(".grid.grid-cols-12")!;
    expect(grid.style.gap).toBe(`${HOME_GRID_GAP_PRESETS.comfortable}px`);

    rerender(<Harness initial={[CHATROOMS_ITEM]} gap="spacious" />);
    grid = container.querySelector<HTMLElement>(".grid.grid-cols-12")!;
    expect(grid.style.gap).toBe(`${HOME_GRID_GAP_PRESETS.spacious}px`);
  });

  it("bloque le défilement natif sur la poignée de déplacement et sur le diviseur (mobile)", () => {
    // `touch-action: none` — sans lui, un doigt qui appuie puis bouge sur ces
    // éléments déclenche le défilement natif de la page avant même que notre
    // JS ne reçoive le premier `pointermove`.
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 4, widgetId: "categories" },
          { id: "b", type: "widget", x: 4, y: 0, w: 8, widgetId: "chatrooms" },
        ]}
      />,
    );
    expect(container.querySelector(".wghe-drag-handle")).toHaveClass("touch-none");
    expect(container.querySelector(".wghe-divider")).toHaveClass("touch-none");
  });

  it("élargit la zone de saisie d'un diviseur au-delà de la gouttière visuelle sur les petits espacements", () => {
    // Une gouttière "compact" (8px) est trop fine pour viser au doigt — la
    // zone RÉACTIVE au toucher/clic s'élargit à 24px minimum, centrée sur la
    // gouttière visuelle réelle, qui reste fine.
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 4, widgetId: "categories" },
          { id: "b", type: "widget", x: 4, y: 0, w: 8, widgetId: "chatrooms" },
        ]}
        gap="compact"
      />,
    );
    const divider = container.querySelector<HTMLElement>(".wghe-divider")!;
    const hitWidth = Number.parseFloat(divider.style.width);
    const gapPx = HOME_GRID_GAP_PRESETS.compact;
    expect(hitWidth).toBeGreaterThanOrEqual(24);
    expect(hitWidth).toBeGreaterThan(gapPx);
    // Centrée sur la gouttière : la boîte déborde symétriquement de part et
    // d'autre de l'espace visuel de gapPx.
    expect(Number.parseFloat(divider.style.marginLeft)).toBeCloseTo(-(gapPx + hitWidth) / 2);
  });

  it("un pointerdown sur un bouton d'action (poignée) ne déclenche pas de déplacement", async () => {
    // Régression : les boutons d'action (éditer, réglages, supprimer)
    // vivent dans la même poignée que le glisser-déposer. Un pointerdown
    // dessus capturait déjà le pointeur et démarrait un déplacement avant
    // que le clic natif n'atteigne le bouton — celui-ci devenait
    // impossible à actionner. jsdom stubbant `setPointerCapture` en no-op
    // (voir vitest.setup.ts), on ne peut pas simuler la vraie suppression
    // du clic ; on vérifie donc le garde-fou lui-même, via son effet
    // observable (le bloc ne passe jamais en transparence de "actif").
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "categories" },
        ]}
      />,
    );

    const deleteButton = screen.getByLabelText("Supprimer");
    const block = container.querySelector<HTMLElement>('[data-block-id="a"]')!;

    await act(async () => {
      fireEvent.pointerDown(deleteButton, { button: 0 });
    });

    expect(block.className).not.toContain("opacity-50");

    await act(async () => {
      fireEvent.pointerUp(window);
    });
  });

  it("un pointerdown sur l'icône SVG à l'intérieur d'un bouton d'action ne déclenche pas non plus de déplacement", async () => {
    // Régression : au centre d'une icône (Pencil/Trash2/Settings2…),
    // `elementFromPoint` renvoie le `<svg>` lui-même, pas le `<button>` qui le
    // contient — vérifié en conditions réelles via un navigateur. Un
    // SVGElement n'hérite PAS de HTMLElement, donc le garde-fou d'origine
    // (`event.target instanceof HTMLElement`) y était toujours faux : la
    // quasi-totalité des clics sur ces icônes déclenchaient un déplacement
    // au lieu de l'action. Ce test cible explicitement le `<svg>`, pas le
    // `<button>`, pour reproduire ce cas — le test précédent (qui cible le
    // bouton directement) ne l'aurait pas détecté.
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "categories" },
        ]}
      />,
    );

    const deleteButton = screen.getByLabelText("Supprimer");
    const icon = deleteButton.querySelector("svg")!;
    const block = container.querySelector<HTMLElement>('[data-block-id="a"]')!;

    await act(async () => {
      fireEvent.pointerDown(icon, { button: 0 });
    });

    expect(block.className).not.toContain("opacity-50");

    await act(async () => {
      fireEvent.pointerUp(window);
    });
  });

  it("ne réarrange pas la grille pendant le glissement, seulement au relâchement", async () => {
    // Régression : appliquer le déplacement en continu déplaçait les lignes
    // sous le curseur, ce qui changeait la cible, ce qui réarrangeait encore…
    // La zone visée se dérobait, rendant l'insertion entre deux lignes très
    // difficile à viser. Le geste ne montre donc plus qu'un repère.
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [CHATROOMS_ITEM] });
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" },
          { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" },
        ]}
      />,
    );

    const before = [...container.querySelectorAll<HTMLElement>("[data-block-id]")].map(
      (el) => `${el.dataset.blockId}:${el.style.gridColumn}:${el.style.gridRow}`,
    );

    const handle = container.querySelector('[data-block-id="b"] .wghe-drag-handle')!;
    await act(async () => {
      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 100, clientY: 60 });
    });

    // Positions inchangées : rien n'a bougé sous le curseur.
    const during = [...container.querySelectorAll<HTMLElement>("[data-block-id]")].map(
      (el) => `${el.dataset.blockId}:${el.style.gridColumn}:${el.style.gridRow}`,
    );
    expect(during).toEqual(before);
    expect(setWorldHomeGridMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.pointerUp(window);
    });
    await waitFor(() => expect(setWorldHomeGridMock).toHaveBeenCalledTimes(1));
  });

  it("affiche un grillage des colonnes (11 frontières) pendant un déplacement, absent au repos", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [CHATROOMS_ITEM] });
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" },
          { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" },
        ]}
      />,
    );

    expect(screen.queryAllByTestId("wghe-column-grid-line")).toHaveLength(0);

    const handle = container.querySelector('[data-block-id="b"] .wghe-drag-handle')!;
    await act(async () => {
      fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 100, clientY: 60 });
    });

    const lines = screen.getAllByTestId("wghe-column-grid-line");
    expect(lines).toHaveLength(11);
    // Centré sur le milieu de la gouttière, pas calé sur le bord d'une piste
    // — même formule que le diviseur de redimensionnement (voir le
    // commentaire dans WorldHomeGridEditor.tsx). Gouttière par défaut
    // (comfortable) puisque `Harness` ne reçoit pas de `gap` ici.
    const gapPx = HOME_GRID_GAP_PRESETS.comfortable;
    expect(lines[0].style.marginLeft).toBe(`${-gapPx / 2}px`);

    await act(async () => {
      fireEvent.pointerUp(window);
    });
    await waitFor(() => expect(setWorldHomeGridMock).toHaveBeenCalledTimes(1));
    expect(screen.queryAllByTestId("wghe-column-grid-line")).toHaveLength(0);
  });

  it("affiche aussi le grillage des colonnes pendant un redimensionnement de frontière", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [CHATROOMS_ITEM] });
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" },
          { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" },
        ]}
      />,
    );

    const divider = container.querySelector<HTMLElement>(".wghe-divider")!;
    await act(async () => {
      fireEvent.pointerDown(divider, { button: 0, clientX: 300 });
    });

    expect(screen.getAllByTestId("wghe-column-grid-line")).toHaveLength(11);

    await act(async () => {
      fireEvent.pointerUp(window);
    });
  });

  it("marque les deux blocs en transparence dès le pointerdown sur la frontière, avant tout mouvement", async () => {
    // Régression : `activeId` (posé au pointerdown) ne rendait transparent
    // QUE le bloc de gauche — le droit dépendait de `resizePreview`, posé
    // seulement au premier pointermove. Le temps d'un instant, un seul des
    // deux blocs de la paire changeait de style.
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" },
          { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" },
        ]}
      />,
    );

    const divider = container.querySelector<HTMLElement>(".wghe-divider")!;
    const blockA = container.querySelector<HTMLElement>('[data-block-id="a"]')!;
    const blockB = container.querySelector<HTMLElement>('[data-block-id="b"]')!;

    await act(async () => {
      fireEvent.pointerDown(divider, { button: 0, clientX: 300 });
    });

    expect(blockA.className).toContain("opacity-50");
    expect(blockB.className).toContain("opacity-50");

    await act(async () => {
      fireEvent.pointerUp(window);
    });
  });

  it("suit le curseur au pixel pendant le glissement d'une frontière, et ne se cale qu'au relâchement", async () => {
    // Le modèle ne connaît que des colonnes entières : arrondir en continu
    // faisait sauter la séparation d'une colonne (~50px) à la fois. Pendant
    // le geste on ne décale donc que l'affichage (marges), sans toucher aux
    // coordonnées ; la conversion en colonnes n'a lieu qu'à la fin.
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [CHATROOMS_ITEM] });
    const { container } = render(
      <Harness
        initial={[
          { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" },
          { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" },
        ]}
      />,
    );

    const divider = container.querySelector<HTMLElement>(".wghe-divider")!;
    const blockA = container.querySelector<HTMLElement>('[data-block-id="a"]')!;
    const blockB = container.querySelector<HTMLElement>('[data-block-id="b"]')!;

    await act(async () => {
      fireEvent.pointerDown(divider, { button: 0, clientX: 300 });
      fireEvent.pointerMove(window, { clientX: 317 });
    });

    // Décalage purement visuel : les colonnes du modèle n'ont pas bougé.
    expect(blockA.style.gridColumn).toBe("1 / span 6");
    expect(blockB.style.gridColumn).toBe("7 / span 6");
    // Le bloc de gauche déborde d'autant que celui de droite se rétracte —
    // la frontière bouge, la paire garde sa largeur totale. (La valeur exacte
    // dépend de la largeur mesurée du conteneur, nulle sous jsdom : le geste
    // est alors borné par la largeur minimale, ce qui est le comportement
    // attendu. On vérifie donc la mécanique, pas un nombre de pixels.)
    const shift = Number.parseFloat(blockB.style.marginLeft);
    expect(shift).toBeGreaterThan(0);
    expect(Number.parseFloat(blockA.style.marginRight)).toBeCloseTo(-shift);
    expect(setWorldHomeGridMock).not.toHaveBeenCalled();

    // Les DEUX blocs de la paire sont marqués : la frontière appartient
    // autant à l'un qu'à l'autre, et leurs largeurs changent ensemble.
    expect(blockA.className).toContain("opacity-50");
    expect(blockB.className).toContain("opacity-50");

    await act(async () => {
      fireEvent.pointerUp(window);
    });
    await waitFor(() => expect(setWorldHomeGridMock).toHaveBeenCalledTimes(1));
  });

  it("ne met aucun diviseur autour d'un bloc seul sur sa ligne", () => {
    // Une ligne occupe toujours toute la largeur : ses bords extérieurs n'ont
    // rien à étirer.
    const { container } = render(<Harness initial={[CHATROOMS_ITEM]} />);
    expect(container.querySelectorAll(".wghe-divider")).toHaveLength(0);
  });

  it("affiche les blocs existants et ne propose que les widgets non utilisés dans le menu", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    expect(screen.getAllByText("Salons").length).toBeGreaterThan(0);

    await user.click(screen.getByText("Ajouter un widget"));
    expect(screen.getByRole("menuitem", { name: "Catégories" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Salons" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Annonce" })).not.toBeInTheDocument();
  });

  it("ajoute un widget et persiste", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [CHATROOMS_ITEM, { ...CHATROOMS_ITEM, id: "new", widgetId: "categories" }] });
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Catégories" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        expect.arrayContaining([expect.objectContaining({ widgetId: "categories" })]),
      );
    });
  });

  it("ajoute un bloc html via l'éditeur de contenu et persiste", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [{ id: "new", type: "html", x: 0, y: 0, w: 12, html: "<p>Salut</p>" }] });
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    await user.click(screen.getByText("Ajouter un bloc"));
    await user.click(screen.getByRole("menuitem", { name: "Bloc HTML" }));
    await user.type(screen.getByLabelText("HTML / CSS"), "<p>Salut</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        expect.arrayContaining([expect.objectContaining({ type: "html", html: "<p>Salut</p>" })]),
      );
    });
  });

  it("ajoute un bloc markdown via l'éditeur de contenu et persiste", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [{ id: "new", type: "markdown", x: 0, y: 0, w: 12, content: "Salut" }] });
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    await user.click(screen.getByText("Ajouter un bloc"));
    await user.click(screen.getByRole("menuitem", { name: "Bloc Markdown" }));
    await user.type(screen.getByLabelText("Markdown"), "Salut");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        expect.arrayContaining([expect.objectContaining({ type: "markdown", content: "Salut" })]),
      );
    });
  });

  it("ajoute un bloc bannière via son dialogue et persiste", async () => {
    setWorldHomeGridMock.mockResolvedValue({
      ok: true,
      items: [{ id: "new", type: "banner", x: 0, y: 0, w: 12, banner: { title: "Bienvenue" } }],
    });
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    await user.click(screen.getByText("Ajouter un bloc"));
    await user.click(screen.getByRole("menuitem", { name: "Bloc bannière" }));
    await user.type(screen.getByLabelText("Titre"), "Bienvenue");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        expect.arrayContaining([expect.objectContaining({ type: "banner", banner: { title: "Bienvenue" } })]),
      );
    });
  });

  it("uploade l'image de fond d'une bannière sous le préfixe user-{id}/world-{id}/, requis par la policy RLS du bucket worlds", async () => {
    // Régression : un premier essai stockait sous `home-banner/{worldId}/…`,
    // rejeté par la policy RLS d'écriture du bucket `worlds`, qui n'autorise
    // que le préfixe `user-{auth.uid()}/…` (voir WorldSettingsView.tsx pour
    // le même schéma côté bannière/icône de monde).
    const user = userEvent.setup();
    render(<Harness initial={[]} />);

    await user.click(screen.getByText("Ajouter un bloc"));
    await user.click(screen.getByRole("menuitem", { name: "Bloc bannière" }));

    const file = new File(["x"], "banner.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(bannerUploadMock).toHaveBeenCalled());
    const path = bannerUploadMock.mock.calls[0][0] as string;
    expect(path).toMatch(/^user-u1\/world-w1\//);
  });

  it("modifie un bloc bannière existant via le crayon", async () => {
    const bannerItem: WorldHomeGridItem = {
      id: "c", type: "banner", x: 0, y: 8, w: 12, banner: { title: "Ancien titre" },
    };
    setWorldHomeGridMock.mockResolvedValue({
      ok: true,
      items: [{ ...bannerItem, banner: { title: "Nouveau titre" } }],
    });
    const user = userEvent.setup();
    render(<Harness initial={[bannerItem]} />);

    await user.click(screen.getByLabelText("Modifier le bloc"));
    const field = screen.getByLabelText("Titre");
    expect(field).toHaveValue("Ancien titre");
    await user.clear(field);
    await user.type(field, "Nouveau titre");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        [expect.objectContaining({ id: "c", type: "banner", banner: { title: "Nouveau titre" } })],
      );
    });
  });

  it("modifie le contenu d'un bloc html existant via le crayon", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [{ ...HTML_ITEM, html: "<p>y</p>" }] });
    const user = userEvent.setup();
    render(<Harness initial={[HTML_ITEM]} />);

    await user.click(screen.getByLabelText("Modifier le bloc"));
    const field = screen.getByLabelText("HTML / CSS");
    await user.clear(field);
    await user.type(field, "<p>y</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        [expect.objectContaining({ id: "b", type: "html", html: "<p>y</p>" })],
      );
    });
  });

  it("identifie un bloc html par son titre libre, sinon par son type", () => {
    render(
      <Harness
        initial={[
          { ...HTML_ITEM, id: "titré", title: "Bandeau d'accueil" },
          { id: "sans-titre", type: "markdown", x: 0, y: 2, w: 12, content: "# Salut" },
        ]}
      />,
    );

    expect(screen.getByText("Bandeau d'accueil")).toBeInTheDocument();
    // Sans titre, le libellé retombe sur le type — jamais un extrait du
    // contenu, qui serait illisible.
    expect(screen.getByText("Bloc Markdown")).toBeInTheDocument();
    expect(screen.queryByText(/# Salut/)).not.toBeInTheDocument();
  });

  it("n'affiche l'icône de réglages que pour les widgets qui en déclarent", async () => {
    render(<Harness initial={[CHATROOMS_ITEM, { id: "c", type: "widget", x: 0, y: 1, w: 12, widgetId: "categories" }]} />);
    // « Salons » déclare visibleRows, « Catégories » ne déclare rien.
    expect(screen.getAllByLabelText("Réglages du bloc")).toHaveLength(1);
  });

  it("persiste les réglages à la fermeture du popover, pas à chaque frappe", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [CHATROOMS_ITEM] });
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    await user.click(screen.getByLabelText("Réglages du bloc"));
    const field = await screen.findByLabelText("Lignes visibles");
    await user.clear(field);
    await user.type(field, "3");
    // Rien n'est encore parti côté serveur pendant la saisie.
    expect(setWorldHomeGridMock).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith(
        "w1",
        [expect.objectContaining({ options: { visibleRows: 3 } })],
      );
    });
  });

  it("supprime un bloc après confirmation", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [] });
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    await user.click(screen.getByLabelText("Supprimer"));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => {
      expect(setWorldHomeGridMock).toHaveBeenCalledWith("w1", []);
    });
  });

  it("annule le changement optimiste et affiche une erreur si la persistance échoue", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: false, error: "saveFailed" });
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Catégories" }));

    await waitFor(() => {
      // Le code renvoyé par l'action est traduit avant affichage : « nope »
    // n'est pas un code connu, il retombe donc sur le message générique.
    expect(toast.error).toHaveBeenCalledWith("L'enregistrement a échoué");
    });
    // Le widget ajouté de façon optimiste disparaît après le rollback.
    await waitFor(() => {
      expect(screen.queryByText("Catégories")).not.toBeInTheDocument();
    });
  });

  it("ignore la réponse d'un enregistrement dépassé par un plus récent", async () => {
    // Deux gestes rapprochés : la réponse du premier arrive après celle du
    // second et ne doit pas ramener son état (périmé) à l'écran.
    let resolveFirst!: (v: unknown) => void;
    setWorldHomeGridMock
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({
        ok: true,
        items: [CHATROOMS_ITEM, { ...CHATROOMS_ITEM, id: "second", widgetId: "personas_recent" }],
      });

    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Catégories" }));
    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Personas récents" }));

    await waitFor(() => {
      expect(screen.getAllByText("Personas récents").length).toBeGreaterThan(0);
    });

    // La réponse tardive du premier enregistrement ne doit rien réécrire.
    resolveFirst({ ok: true, items: [CHATROOMS_ITEM, { ...CHATROOMS_ITEM, id: "first", widgetId: "categories" }] });

    await waitFor(() => {
      expect(screen.getAllByText("Personas récents").length).toBeGreaterThan(0);
    });
  });

  it("appelle onPersisted une fois l'écriture confirmée", async () => {
    setWorldHomeGridMock.mockResolvedValue({ ok: true, items: [CHATROOMS_ITEM] });
    const onPersisted = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[CHATROOMS_ITEM]} onPersisted={onPersisted} />);

    await user.click(screen.getByText("Ajouter un widget"));
    await user.click(screen.getByRole("menuitem", { name: "Catégories" }));

    await waitFor(() => {
      expect(onPersisted).toHaveBeenCalled();
    });
  });
});
