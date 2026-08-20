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
    ];
    render(<WorldHomeGridView {...baseProps(items)} />);

    expect(screen.getByTestId("categories")).toBeInTheDocument();
    expect(screen.getByTestId("chatrooms")).toBeInTheDocument();
    // Widgets chargés via next/dynamic — résolution asynchrone même mockés.
    expect(await screen.findByTestId("members_online")).toBeInTheDocument();
    expect(await screen.findByTestId("wiki_shortcuts")).toBeInTheDocument();
    expect(await screen.findByTestId("personas_recent")).toBeInTheDocument();
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

  it("rend un bloc html dans une iframe sandboxée", () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>Salut</p>" }])}
      />,
    );
    const iframe = document.querySelector("iframe")!;
    expect(iframe).toHaveAttribute("sandbox", "");
    expect(iframe).toHaveAttribute("srcdoc", "<p>Salut</p>");
  });

  it("donne à l'iframe html le titre du bloc, pour l'accessibilité", () => {
    render(
      <WorldHomeGridView
        {...baseProps([
          { id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>Salut</p>", title: "Bandeau d'accueil" },
        ])}
      />,
    );
    expect(document.querySelector("iframe")).toHaveAttribute("title", "Bandeau d'accueil");
  });

  it("retombe sur un titre générique quand le bloc html n'a pas de titre", () => {
    render(
      <WorldHomeGridView
        {...baseProps([{ id: "a", type: "html", x: 0, y: 0, w: 12, html: "<p>Salut</p>" }])}
      />,
    );
    const iframe = document.querySelector("iframe")!;
    expect(iframe.getAttribute("title")).toBeTruthy();
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
