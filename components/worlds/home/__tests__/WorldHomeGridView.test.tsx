import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HOME_GRID_GAP_PRESETS, type WorldHomeGridItem } from "@/components/worlds/home/worldHomeGrid";

const categoryFoldersProps = vi.fn();
vi.mock("@/components/worlds/chatrooms/WorldCategoryFolders", () => ({
  WorldCategoryFolders: (props: Record<string, unknown>) => {
    categoryFoldersProps(props);
    return <div data-testid="categories" />;
  },
}));

const chatroomsGridProps = vi.fn();
vi.mock("@/components/worlds/chatrooms/WorldChatroomsGrid", () => ({
  WorldChatroomsGrid: (props: Record<string, unknown>) => {
    chatroomsGridProps(props);
    return <div data-testid="chatrooms" />;
  },
}));

const composerProps = vi.fn();
vi.mock("@/components/worlds/chatrooms/WorldChatComposer", () => ({
  WorldChatComposer: (props: Record<string, unknown>) => {
    composerProps(props);
    return <div data-testid="composer" />;
  },
}));

const markdownProps = vi.fn();
vi.mock("@/components/MarkdownRenderer", () => ({
  default: (props: Record<string, unknown>) => {
    markdownProps(props);
    return <div data-testid="markdown" />;
  },
}));

vi.mock("@/components/worlds/home/widgets/WorldMembersOnlineWidget", () => ({
  WorldMembersOnlineWidget: () => <div data-testid="members_online" />,
}));
vi.mock("@/components/worlds/home/widgets/WorldWikiShortcutsWidget", () => ({
  WorldWikiShortcutsWidget: () => <div data-testid="wiki_shortcuts" />,
}));
vi.mock("@/components/worlds/home/widgets/WorldRecentPersonasWidget", () => ({
  WorldRecentPersonasWidget: () => <div data-testid="personas_recent" />,
}));

const mapWidgetProps = vi.fn();
vi.mock("@/components/worlds/home/widgets/WorldMapWidget", () => ({
  WorldMapWidget: (props: Record<string, unknown>) => {
    mapWidgetProps(props);
    return <div data-testid="map" />;
  },
}));

const timelineShortcutsProps = vi.fn();
vi.mock("@/components/worlds/home/widgets/WorldTimelineShortcutsWidget", () => ({
  WorldTimelineShortcutsWidget: (props: Record<string, unknown>) => {
    timelineShortcutsProps(props);
    return <div data-testid="timeline_shortcuts" />;
  },
}));

import { WorldHomeGridView } from "@/components/worlds/home/WorldHomeGridView";

function baseProps(items: WorldHomeGridItem[]) {
  return {
    items,
    worldId: "w1",
    canPost: true,
    canCreateChatroom: true,
    initialRooms: [],
    selectedCategoryId: null,
    onSelectCategory: vi.fn(),
  };
}

describe("WorldHomeGridView", () => {
  it("rend chaque type de widget attendu", async () => {
    const items: WorldHomeGridItem[] = [
      { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" },
      { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" },
      { id: "d", type: "widget", x: 0, y: 6, w: 12, widgetId: "members_online" },
      { id: "e", type: "widget", x: 0, y: 9, w: 12, widgetId: "wiki_shortcuts" },
      { id: "f", type: "widget", x: 0, y: 13, w: 12, widgetId: "personas_recent" },
      { id: "g", type: "widget", x: 0, y: 17, w: 12, widgetId: "timeline_shortcuts" },
    ];
    render(<WorldHomeGridView {...baseProps(items)} />);

    expect(screen.getByTestId("categories")).toBeInTheDocument();
    expect(screen.getByTestId("chatrooms")).toBeInTheDocument();
    expect(screen.getByTestId("timeline_shortcuts")).toBeInTheDocument();
    // Widgets chargés via next/dynamic — résolution asynchrone même mockés.
    expect(await screen.findByTestId("members_online")).toBeInTheDocument();
    expect(await screen.findByTestId("wiki_shortcuts")).toBeInTheDocument();
    expect(await screen.findByTestId("personas_recent")).toBeInTheDocument();
  });

  it("transmet les salons et la config de chronologie au widget de raccourcis chronologie", () => {
    const initialRooms = [{ id: "r1", title: "Prologue", name: null, icon_url: null, last_message_at: null, unread_count: 0, timeline_date: { year: 1, month: null, day: null } }];
    const timelineConfig = { year_label: "An", era_name: null, month_names: [], current_year: 1, current_month: null };
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "timeline_shortcuts" }])}
        initialRooms={initialRooms}
        timelineConfig={timelineConfig}
      />,
    );
    expect(timelineShortcutsProps).toHaveBeenCalledWith(
      expect.objectContaining({ worldId: "w1", rooms: initialRooms, config: timelineConfig, limit: 6 }),
    );
  });

  it("le widget de raccourcis chronologie ne reçoit aucune config quand la chronologie n'est pas activée", () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "timeline_shortcuts" }])}
      />,
    );
    expect(timelineShortcutsProps).toHaveBeenCalledWith(expect.objectContaining({ config: undefined }));
  });

  it("rend un bloc composer", () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "composer" }])}
      />,
    );
    expect(screen.getByTestId("composer")).toBeInTheDocument();
  });

  it("catégories et salons partagent selectedCategoryId/onSelectCategory", () => {
    const onSelectCategory = vi.fn();
    render(
      <WorldHomeGridView
        {...baseProps([
          { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" },
          { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" },
        ])}
        selectedCategoryId="cat-1"
        onSelectCategory={onSelectCategory}
      />,
    );
    expect(categoryFoldersProps).toHaveBeenCalledWith(
      expect.objectContaining({ selectedCategoryId: "cat-1", onSelectCategory }),
    );
    expect(chatroomsGridProps).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-1" }));
  });

  it("passe fullWidth=true au bloc catégories quand il occupe seul les 12 colonnes, false s'il partage sa ligne", () => {
    const { rerender } = render(
      <WorldHomeGridView
        {...baseProps([
          { id: "a", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" },
          { id: "b", type: "widget", x: 6, y: 0, w: 6, widgetId: "chatrooms" },
        ])}
      />,
    );
    expect(categoryFoldersProps).toHaveBeenCalledWith(expect.objectContaining({ fullWidth: false }));

    rerender(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "categories" }])}
      />,
    );
    expect(categoryFoldersProps).toHaveBeenCalledWith(expect.objectContaining({ fullWidth: true }));
  });

  it("rend un bloc html dans la page, sans iframe", async () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>Salut</p>" }])}
      />,
    );
    expect(await screen.findByText("Salut")).toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
  });

  // Le bac à sable de l'iframe ayant disparu, c'est l'assainissement qui
  // porte la garantie « aucun script » — jusque dans le rendu réel, pas
  // seulement dans la fonction pure testée par homeHtmlBlock.test.ts.
  it("ne laisse passer ni script ni gestionnaire d'événement dans un bloc html", async () => {
    const { container } = render(
      <WorldHomeGridView
        {...baseProps([
          {
            id: "a",
            type: "html",
            x: 0,
            y: 0,
            w: 12,
            html: '<p>Salut</p><script>alert(1)</script><img src="https://x/y.png" onerror="alert(2)">',
          },
        ])}
      />,
    );
    expect(await screen.findByText("Salut")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
  });

  it("laisse les lignes s'auto-dimensionner au contenu, sans overflow ni hauteur imposée", () => {
    const { container } = render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms" }])}
      />,
    );
    const grid = container.firstElementChild!;
    expect(grid.className).toContain("auto-rows-min");

    // Pas de hauteur figée ni de défilement de secours par cellule : un
    // contenu long agrandit sa ligne au lieu de déborder ou d'être coupé.
    const cell = container.querySelector("[data-testid='chatrooms']")!.parentElement!;
    expect(cell.className).not.toContain("overflow-y-auto");
    expect(cell.className).not.toContain("h-full");
    // La largeur reste réglable (span de colonnes) mais la ligne est unique :
    // `--gr` cible une ligne précise, sans `span`.
    expect(cell.style.getPropertyValue("--gc")).toContain("span");
    expect(cell.style.getPropertyValue("--gr")).not.toContain("span");
  });

  it("applique le préréglage d'espacement du monde, comfortable par défaut", () => {
    const { container } = render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms" }])}
      />,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gap).toBe(`${HOME_GRID_GAP_PRESETS.comfortable}px`);
  });

  it("bascule sur le préréglage choisi par l'admin — même valeur que l'éditeur, voir worldHomeGrid.ts", () => {
    const { container } = render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms" }])}
        gap="spacious"
      />,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gap).toBe(`${HOME_GRID_GAP_PRESETS.spacious}px`);
  });

  it("n'affiche jamais le titre d'un bloc — il ne sert qu'à l'éditeur", () => {
    render(
      <WorldHomeGridView
        {...baseProps([
          { id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>Salut</p>", title: "Bandeau d'accueil" },
        ])}
      />,
    );
    expect(screen.queryByText("Bandeau d'accueil")).not.toBeInTheDocument();
  });

  it("transmet les réglages du bloc au widget (visibleRows des salons)", () => {
    render(
      <WorldHomeGridView
        {...baseProps([
          { id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms", options: { visibleRows: 3 } },
        ])}
      />,
    );
    expect(chatroomsGridProps).toHaveBeenCalledWith(expect.objectContaining({ visibleRows: 3 }));
  });

  it("transmet la valeur par défaut du registre quand le bloc n'a pas de réglage", () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "chatrooms" }])}
      />,
    );
    expect(chatroomsGridProps).toHaveBeenCalledWith(expect.objectContaining({ visibleRows: 8 }));
  });

  it("rend un bloc markdown via MarkdownRenderer", () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "# Titre" }])}
      />,
    );
    expect(screen.getByTestId("markdown")).toBeInTheDocument();
    expect(markdownProps).toHaveBeenCalledWith(expect.objectContaining({ content: "# Titre", allowImages: true }));
  });

  it("un bloc html en carte (défaut) a une bordure et un fond", async () => {
    const { container } = render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", card: true }])}
      />,
    );
    await screen.findByText("x");
    const hôte = container.querySelector(".wvlds-home-html-block")!;
    expect(hôte.className).toContain("border");
    expect(hôte.className).toContain("bg-background");
  });

  it("un bloc html en plein largeur (card: false) n'a ni bordure ni fond", async () => {
    const { container } = render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", card: false }])}
      />,
    );
    await screen.findByText("x");
    const hôte = container.querySelector(".wvlds-home-html-block")!;
    expect(hôte.className).not.toContain("border");
    expect(hôte.className).not.toContain("bg-background");
  });

  // L'enveloppe qui porte le confinement doit rester HORS du `@scope` de la
  // feuille du bloc : c'est ce qui la met hors de portée de ses sélecteurs.
  // Si la racine du scope et l'enveloppe redevenaient un seul élément, une
  // règle `:scope { contain: none !important }` du bloc désactiverait le
  // confinement et laisserait un `position: fixed` recouvrir l'application.
  it("confine le bloc html depuis une enveloppe extérieure à son @scope", async () => {
    const { container } = render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>" }])}
      />,
    );
    await screen.findByText("x");

    const enveloppe = container.querySelector(".wvlds-home-html-block")!;
    const racineDuScope = container.querySelector(".wvlds-hb-a")!;
    expect(enveloppe.contains(racineDuScope)).toBe(true);
    expect(enveloppe).not.toBe(racineDuScope);
  });

  it("un bloc markdown en plein largeur (défaut) n'est pas enveloppé dans une carte", () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "x", card: false }])}
      />,
    );
    const markdown = screen.getByTestId("markdown");
    // Le parent direct est la cellule de grille (@container), pas une carte.
    expect(markdown.parentElement?.className).not.toContain("border");
  });

  it("un bloc markdown en carte (card: true) est enveloppé dans une carte", () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "x", card: true }])}
      />,
    );
    const markdown = screen.getByTestId("markdown");
    expect(markdown.parentElement?.className).toContain("border");
  });

  it("rend un bloc bannière avec son titre et son texte", () => {
    render(
      <WorldHomeGridView
        {...baseProps([
          { id: "a", type: "banner", x: 0, y: 0, w: 12, banner: { title: "Bienvenue", text: "Salut à tous" } },
        ])}
      />,
    );
    expect(screen.getByText("Bienvenue")).toBeInTheDocument();
    expect(screen.getByText("Salut à tous")).toBeInTheDocument();
  });

  it("rend le bouton d'un bloc bannière quand libellé et URL sont présents", () => {
    render(
      <WorldHomeGridView
        {...baseProps([
          {
            id: "a", type: "banner", x: 0, y: 0, w: 12,
            banner: { title: "Bienvenue", buttonLabel: "En savoir plus", buttonUrl: "/wiki" },
          },
        ])}
      />,
    );
    const link = screen.getByRole("link", { name: "En savoir plus" });
    expect(link).toHaveAttribute("href", "/wiki");
  });

  it("trie les blocs par y puis x pour un ordre de pile mobile cohérent", async () => {
    render(
      <WorldHomeGridView
        {...baseProps([
          { id: "second", type: "widget", x: 6, y: 5, w: 6, widgetId: "members_online" },
          { id: "first", type: "widget", x: 0, y: 0, w: 6, widgetId: "categories" },
          { id: "third", type: "widget", x: 0, y: 5, w: 6, widgetId: "chatrooms" },
        ])}
      />,
    );
    // Widget chargé via next/dynamic — résolution asynchrone même mocké.
    await screen.findByTestId("members_online");
    const testIds = screen.getAllByTestId(/categories|members_online|chatrooms/).map((el) => el.dataset.testid);
    expect(testIds).toEqual(["categories", "chatrooms", "members_online"]);
  });
});

describe("WorldHomeGridView — hauteur des blocs à contenu libre", () => {
  it("applique la hauteur réglée au bloc html, qui fait défiler son surplus", async () => {
    const { container } = render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>", h: 320 }])}
      />,
    );
    await screen.findByText("x");
    const hôte = container.querySelector(".wvlds-home-html-block") as HTMLElement;
    expect(hôte.style.height).toBe("320px");
    expect(hôte.className).toContain("overflow-y-auto");
  });

  // Sans hauteur, le bloc suit son contenu — ce que le rendu en ligne permet
  // enfin, là où l'iframe retombait sur ses 150 px intrinsèques.
  it("laisse le bloc html sans hauteur imposée quand aucune n'est réglée", async () => {
    const { container } = render(
      <WorldHomeGridView {...baseProps([{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>x</p>" }])} />,
    );
    await screen.findByText("x");
    const hôte = container.querySelector(".wvlds-home-html-block") as HTMLElement;
    expect(hôte.style.height).toBe("");
    expect(hôte.className).not.toContain("overflow-y-auto");
  });

  it("un bloc markdown avec hauteur fait défiler son surplus à l'intérieur", () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "x", h: 240 }])}
      />,
    );
    const conteneur = screen.getByTestId("markdown").parentElement!;
    expect(conteneur.style.height).toBe("240px");
    expect(conteneur.className).toContain("overflow-y-auto");
  });

  it("un bloc markdown avec hauteur ET carte garde le style de la carte", () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "x", card: true, h: 240 }])}
      />,
    );
    const conteneur = screen.getByTestId("markdown").parentElement!;
    expect(conteneur.className).toContain("overflow-y-auto");
    expect(conteneur.className).toContain("border");
  });

  it("un bloc markdown sans hauteur n'ajoute aucun conteneur de défilement", () => {
    render(
      <WorldHomeGridView {...baseProps([{ id: "a", type: "markdown", x: 0, y: 0, w: 12, content: "x" }])} />,
    );
    expect(screen.getByTestId("markdown").parentElement!.className).not.toContain("overflow-y-auto");
  });
});

describe("WorldHomeGridView — bloc Carte", () => {
  it("rend le bloc avec les cartes résolues côté serveur", () => {
    const cartes = [{ id: "m1", label: "Hadea", image_url: null, pin_count: 2 }];
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "widget", x: 0, y: 0, w: 12, widgetId: "map" }])}
        widgetData={{ maps: cartes }}
      />,
    );

    expect(screen.getByTestId("map")).toBeInTheDocument();
    expect(mapWidgetProps).toHaveBeenCalledWith(expect.objectContaining({ worldId: "w1", initialMaps: cartes }));
  });
});
