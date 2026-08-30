import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "sidebar.subjects": `${opts?.count ?? 0} sujet(s)`,
    };
    return map[key] ?? key;
  },
}));

import { WorldCategoryFolders } from "@/components/worlds/chatrooms/WorldCategoryFolders";

const categories = [
  { id: "cat-1", title: "Annonces", description: null, banner_url: null, icon_url: null, position: 0 },
  { id: "cat-2", title: "Hors-sujet", description: null, banner_url: null, icon_url: null, position: 1 },
];

const chatroomsByCategory = [
  { category_id: "cat-1" },
  { category_id: "cat-1" },
  { category_id: "cat-2" },
  { category_id: null },
];

describe("WorldCategoryFolders", () => {
  let mock: ReturnType<typeof createSupabaseMock>;

  beforeEach(() => {
    mock = createSupabaseMock({
      results: [
        { data: categories },
        { data: chatroomsByCategory },
      ],
    });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(mock.client);
  });

  it("n'affiche rien tant qu'il n'y a pas de catégories", async () => {
    const localMock = createSupabaseMock({ results: [{ data: [] }, { data: [] }] });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(localMock.client);
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} />,
      ));
    });
    expect(container.textContent).toBe("");
  });

  it("affiche une carte par catégorie avec le nombre de chatrooms associées", async () => {
    await act(async () => {
      render(<WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} />);
    });

    expect(screen.getByText("Annonces")).toBeInTheDocument();
    expect(screen.getByText("Hors-sujet")).toBeInTheDocument();
    expect(screen.getByText("2 sujet(s)")).toBeInTheDocument();
    expect(screen.getByText("1 sujet(s)")).toBeInTheDocument();
  });

  it("sélectionne une catégorie au clic", async () => {
    const onSelectCategory = vi.fn();
    await act(async () => {
      render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={onSelectCategory} />,
      );
    });

    screen.getByText("Annonces").closest("button")!.click();
    expect(onSelectCategory).toHaveBeenCalledWith("cat-1");
  });

  it("désélectionne la catégorie active au second clic", async () => {
    const onSelectCategory = vi.fn();
    await act(async () => {
      render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId="cat-1" onSelectCategory={onSelectCategory} />,
      );
    });

    screen.getByText("Annonces").closest("button")!.click();
    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });

  it("affiche la description à la place du nombre de sujets quand elle est renseignée", async () => {
    const localMock = createSupabaseMock({
      results: [
        {
          data: [
            { id: "cat-1", title: "Annonces", description: "Les news du monde", banner_url: null, icon_url: null, position: 0 },
          ],
        },
        { data: [] },
      ],
    });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(localMock.client);

    await act(async () => {
      render(<WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} />);
    });

    expect(screen.getByText("Les news du monde")).toBeInTheDocument();
    expect(screen.queryByText("0 sujet(s)")).not.toBeInTheDocument();
  });

  it("affiche l'image de bannière de la catégorie quand elle est renseignée", async () => {
    const localMock = createSupabaseMock({
      results: [
        {
          data: [
            { id: "cat-1", title: "Annonces", description: null, banner_url: "https://x/banner.png", icon_url: null, position: 0 },
          ],
        },
        { data: [] },
      ],
    });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(localMock.client);

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} />,
      ));
    });

    expect(container.querySelector("img")).toHaveAttribute("src", expect.stringContaining("banner.png"));
  });

  it("pré-dimensionne l'image via imgproxy et laisse Next.js de côté", async () => {
    // Régression : un `sizes` en px fixe (sans `vw`, seule unité que
    // Next.js sait interpréter) faisait retomber son optimiseur sur sa plus
    // grande largeur configurée (jusqu'à 3840px) plutôt qu'une taille
    // adaptée à la cellule — demander à Next d'agrandir une source déjà
    // petite jusque-là échouait purement et simplement au chargement. On
    // pré-dimensionne donc nous-mêmes (imgproxy, marge DPR) et on court-
    // circuite l'optimiseur de Next via `unoptimized`.
    const localMock = createSupabaseMock({
      results: [
        {
          data: [
            {
              id: "cat-1",
              title: "Annonces",
              description: null,
              banner_url: "https://x.supabase.co/storage/v1/object/public/chatroom-categories/banner.webp",
              icon_url: null,
              position: 0,
            },
          ],
        },
        { data: [] },
      ],
    });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(localMock.client);

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} />,
      ));
    });

    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", expect.stringContaining("width=400"));
    expect(img).toHaveAttribute("src", expect.stringContaining("quality=90"));
    expect(img.getAttribute("src")).not.toContain("/_next/image");
  });

  it("n'étire pas l'image de l'icône (petit format) sur la grande carte quand il n'y a pas de bannière", async () => {
    const localMock = createSupabaseMock({
      results: [
        {
          data: [
            { id: "cat-1", title: "Annonces", description: null, banner_url: null, icon_url: "https://x/icon.png", position: 0 },
          ],
        },
        { data: [] },
      ],
    });
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(localMock.client);

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} />,
      ));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("étagère horizontale de cartes par défaut (mobile : la grille repasse en une colonne unique)", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} />,
      ));
    });

    const root = container.firstElementChild!;
    expect(root.className).toContain("overflow-x-auto");
    const card = screen.getByText("Annonces").closest("button")!;
    expect(card.className).toContain("w-36");
  });

  it("redevient une liste verticale à partir de `sm:` quand le bloc partage sa ligne avec un autre (fullWidth=false)", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} fullWidth={false} />,
      ));
    });

    const root = container.firstElementChild!;
    expect(root.className).toContain("sm:flex-col");
    const card = screen.getByText("Annonces").closest("button")!;
    expect(card.className).toContain("sm:w-auto");
  });

  it("reste en étagère même à partir de `sm:` quand le bloc occupe seul toute sa ligne (fullWidth=true)", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <WorldCategoryFolders worldId="world-1" selectedCategoryId={null} onSelectCategory={vi.fn()} fullWidth />,
      ));
    });

    const root = container.firstElementChild!;
    expect(root.className).not.toContain("sm:flex-col");
    const card = screen.getByText("Annonces").closest("button")!;
    expect(card.className).not.toContain("sm:w-auto");
  });
});

// ── Amorçage depuis le serveur ───────────────────────────────────────────────
//
// `WorldHomeContent` fournit les catégories (getChatroomCategories, mémoïsé et
// partagé avec WorldSidebar) pour que le bloc s'affiche au premier rendu.
//
// Le piège, signalé en revue : distinguer « non fourni » de « fourni, mais
// vide ». Un monde sans aucune catégorie reçoit `[]` du serveur — le prendre
// pour une absence relançait deux requêtes au montage, annulant tout l'intérêt
// de l'amorçage. D'où `undefined` comme seule marque d'absence, préservée d'un
// bout à l'autre de la chaîne de props.

describe("WorldCategoryFolders — amorçage serveur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche les catégories initiales sans requête au montage", () => {
    const m = createSupabaseMock({ results: [] });
    vi.mocked(createClient).mockReturnValue(m.client as never);

    render(
      <WorldCategoryFolders
        worldId="w1"
        selectedCategoryId={null}
        onSelectCategory={vi.fn()}
        initialCategories={categories}
        initialRooms={chatroomsByCategory}
      />,
    );

    expect(screen.getByText("Annonces")).toBeInTheDocument();
    expect(m.from).not.toHaveBeenCalled();
  });

  it("ne relance aucune requête quand le serveur renvoie une liste vide", () => {
    const m = createSupabaseMock({ results: [] });
    vi.mocked(createClient).mockReturnValue(m.client as never);

    const { container } = render(
      <WorldCategoryFolders
        worldId="w1"
        selectedCategoryId={null}
        onSelectCategory={vi.fn()}
        initialCategories={[]}
        initialRooms={[]}
      />,
    );

    // Aucune catégorie → le bloc ne rend rien, et surtout ne va rien chercher.
    expect(container).toBeEmptyDOMElement();
    expect(m.from).not.toHaveBeenCalled();
  });

  it("charge lui-même quand rien ne lui est fourni", async () => {
    const m = createSupabaseMock({ results: [{ data: categories }, { data: chatroomsByCategory }] });
    vi.mocked(createClient).mockReturnValue(m.client as never);

    render(
      <WorldCategoryFolders worldId="w1" selectedCategoryId={null} onSelectCategory={vi.fn()} />,
    );

    await act(async () => { await Promise.resolve(); });
    expect(m.from).toHaveBeenCalledWith("chatroom_categories");
  });
});
