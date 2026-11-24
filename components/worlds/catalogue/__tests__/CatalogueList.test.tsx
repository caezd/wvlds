import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { loadCollapsedCategories } from "@/lib/catalogueCollapse";

// jsdom fournit un localStorage partiel (pas de .clear()) — remplacé par une
// implémentation complète, comme lib/__tests__/searchHistory.test.ts.
const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const actions = vi.hoisted(() => ({
  addWorldCatalogItem: vi.fn(),
  reorderWorldCatalogItems: vi.fn(),
  trashWorldCatalogItem: vi.fn(),
  trashWorldCatalogItems: vi.fn(async (ids: string[]) => ({ ok: true, ids })),
  setWorldCatalogItemsRarity: vi.fn(async (ids: string[]) => ({ ok: true, ids })),
  updateWorldCatalogItem: vi.fn(),
  updateWorldCatalogCategory: vi.fn(),
  addWorldCatalogCategory: vi.fn(),
}));
vi.mock("@/app/actions/worldCatalog", () => ({
  addWorldCatalogItem: actions.addWorldCatalogItem,
  updateWorldCatalogItem: actions.updateWorldCatalogItem,
  trashWorldCatalogItem: actions.trashWorldCatalogItem,
  trashWorldCatalogItems: actions.trashWorldCatalogItems,
  setWorldCatalogItemsRarity: actions.setWorldCatalogItemsRarity,
  restoreWorldCatalogItem: vi.fn(),
  purgeWorldCatalogItem: vi.fn(),
  listTrashedWorldCatalogItems: vi.fn(),
  duplicateWorldCatalogItem: vi.fn(),
  addWorldCatalogCategory: actions.addWorldCatalogCategory,
  updateWorldCatalogCategory: actions.updateWorldCatalogCategory,
  deleteWorldCatalogCategory: vi.fn(),
  reorderWorldCatalogCategories: vi.fn(),
  reorderWorldCatalogItems: actions.reorderWorldCatalogItems,
  importWorldCatalogItems: vi.fn(),
}));

import { CatalogueList } from "@/components/worlds/catalogue/CatalogueList";

const ARMES = { id: "cat-armes", world_id: "w1", type: "inventory", name: "Armes", sort_index: 0, column_index: 0 };
const OUTILS = { id: "cat-outils", world_id: "w1", type: "inventory", name: "Outils", sort_index: 1, column_index: 0 };

function item(id: string, name: string, category_id: string | null, sort_index = 0) {
  return {
    id, world_id: "w1", type: "inventory", name, description: null, icon: null, lucide_icon: null,
    image_url: null, rarity: null, stackable: true, max_quantity: null, properties: [], sort_index, category_id,
  };
}

const EPEE = item("i-epee", "Épée", ARMES.id, 0);
const ARC = item("i-arc", "Arc", ARMES.id, 1);
const POTION = item("i-potion", "Potion", null, 0);
const CORDE = item("i-corde", "Corde", null, 1);

function mount(props: { canEdit?: boolean; categories?: unknown[]; items?: unknown[] } = {}) {
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock({ results: [{ data: props.categories ?? [ARMES, OUTILS] }, { data: props.items ?? [EPEE, ARC, POTION, CORDE] }] }) as never,
  );
  return render(<CatalogueList type="inventory" worldId="w1" canEdit={props.canEdit ?? true} usage={null} />);
}

/**
 * Choisit une entrée d'un sous-menu Radix, au clavier.
 *
 * À la souris, quitter le déclencheur du sous-menu pour rejoindre son contenu
 * passe par une « zone de grâce » calculée sur les rectangles des éléments.
 * Sous jsdom, tous les rectangles sont nuls : le sous-menu se referme avant
 * que le clic n'arrive. Le clavier n'a pas ce détour — c'est aussi le chemin
 * qu'un lecteur d'écran emprunte.
 */
async function chooseInSubmenu(user: ReturnType<typeof userEvent.setup>, subName: string, leafName: string) {
  (await screen.findByRole("menuitem", { name: subName })).focus();
  await user.keyboard("{ArrowRight}");
  (await screen.findByRole("menuitem", { name: leafName })).focus();
  await user.keyboard("{Enter}");
}

/** Les listes envoyées à `reorderWorldCatalogItems`, dans l'ordre des appels. */
function reorderCalls() {
  return actions.reorderWorldCatalogItems.mock.calls.map(([rows]) =>
    (rows as { id: string; sort_index: number; category_id: string | null }[]).map(r => [r.id, r.sort_index, r.category_id]),
  );
}

/** Les colonnes du tableau, de gauche à droite. */
function columns() {
  return screen.getAllByRole("region").map(r => r.getAttribute("aria-label"));
}

describe("CatalogueList — tableau", () => {
  beforeEach(() => {
    localStorage.clear();
    actions.addWorldCatalogCategory.mockReset().mockImplementation(
      (worldId: string, type: string, name: string, pos: { column_index: number; sort_index: number }) =>
        Promise.resolve({ ok: true, category: { id: "cat-new", world_id: worldId, type, name, ...pos } }),
    );
  });

  it("une colonne par catégorie, les objets sans catégorie en tête", async () => {
    mount();
    await screen.findByText("Épée");
    expect(columns()).toEqual(["Sans catégorie", "Armes", "Outils"]);
    const armes = screen.getByRole("region", { name: "Armes" });
    expect(within(armes).getByText("Épée")).toBeInTheDocument();
    expect(within(armes).getByText("Arc")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Sans catégorie" })).getByText("Potion")).toBeInTheDocument();
  });

  it("l'ancienne grille se lit colonne par colonne", async () => {
    mount({ categories: [{ ...OUTILS, column_index: 1, sort_index: 0 }, { ...ARMES, column_index: 0, sort_index: 3 }] });
    await screen.findByText("Épée");
    expect(columns()).toEqual(["Sans catégorie", "Armes", "Outils"]);
  });

  it("pour un visiteur, pas de colonne « Sans catégorie » vide", async () => {
    mount({ canEdit: false, items: [EPEE, ARC] });
    await screen.findByText("Épée");
    expect(columns()).toEqual(["Armes", "Outils"]);
  });

  it("créer une catégorie l'ajoute au bout du tableau", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Épée");
    await user.click(screen.getByRole("button", { name: "Créer une catégorie" }));
    await user.type(screen.getByPlaceholderText("Nom de la catégorie"), "Plantes{Enter}");
    expect(actions.addWorldCatalogCategory).toHaveBeenCalledWith("w1", "inventory", "Plantes", { column_index: 0, sort_index: 2 });
    await waitFor(() => expect(columns()).toEqual(["Sans catégorie", "Armes", "Outils", "Plantes"]));
  });
});

describe("CatalogueList — gestion", () => {
  beforeEach(() => {
    localStorage.clear();
    actions.reorderWorldCatalogItems.mockReset().mockResolvedValue({ ok: true });
    // L'action rend la ligne telle qu'elle est écrite, identifiant compris.
    actions.addWorldCatalogItem.mockReset().mockImplementation(
      (worldId: string, type: string, data: Record<string, unknown>, options?: { id?: string }) =>
        Promise.resolve({ ok: true, item: { id: options?.id, world_id: worldId, type, ...data } }),
    );
    actions.trashWorldCatalogItem.mockReset().mockResolvedValue({ ok: true });
    actions.updateWorldCatalogItem.mockReset().mockResolvedValue({ ok: true });
  });

  it("range un objet dans une catégorie depuis le menu de sa ligne", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(screen.getByRole("button", { name: "Actions pour Potion" }));
    await chooseInSubmenu(user, "Déplacer vers", "Armes");

    // La cible est renumérotée avec l'objet au bout, la source sans lui.
    await waitFor(() => expect(actions.reorderWorldCatalogItems).toHaveBeenCalledTimes(2));
    expect(reorderCalls()).toEqual([
      [["i-epee", 0, "cat-armes"], ["i-arc", 1, "cat-armes"], ["i-potion", 2, "cat-armes"]],
      [["i-corde", 0, null]],
    ]);
  });

  it("propose « Sans catégorie » dans le menu, sauf à un objet qui l'est déjà", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(screen.getByRole("button", { name: "Actions pour Potion" }));
    await user.click(await screen.findByRole("menuitem", { name: "Déplacer vers" }));
    expect(await screen.findByRole("menuitem", { name: "Sans catégorie" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Armes" })).not.toHaveAttribute("aria-disabled");
  });

  it("déplace plusieurs objets cochés d'un coup, dans leur ordre", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Corde" }));
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Potion" }));
    const barre = screen.getByRole("toolbar", { name: "Sélection" });
    // Le mock next-intl ne lit pas les pluriels ICU : seul le nombre est sûr.
    expect(within(barre).getByText(/^2 /)).toBeInTheDocument();

    await user.click(within(barre).getByRole("button", { name: "Déplacer vers" }));
    await user.click(await screen.findByRole("menuitem", { name: "Outils" }));

    // L'ordre de la liste d'origine est gardé (Potion avant Corde), pas celui
    // des coches. La source, vidée, n'a rien à renuméroter.
    await waitFor(() => expect(actions.reorderWorldCatalogItems).toHaveBeenCalledTimes(1));
    expect(reorderCalls()).toEqual([[["i-potion", 0, "cat-outils"], ["i-corde", 1, "cat-outils"]]]);
  });

  it("envoie la sélection à la corbeille et la vide", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Épée" }));
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Arc" }));
    await user.click(within(screen.getByRole("toolbar", { name: "Sélection" })).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(screen.queryByText("Épée")).toBeNull());
    expect(screen.queryByText("Arc")).toBeNull();
    // Toute la sélection en UNE action serveur.
    expect(actions.trashWorldCatalogItems).toHaveBeenCalledTimes(1);
    expect(actions.trashWorldCatalogItems).toHaveBeenCalledWith(expect.arrayContaining(["i-epee", "i-arc"]));
    expect(actions.trashWorldCatalogItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("toolbar", { name: "Sélection" })).toBeNull();
  });

  it("change la rareté de la sélection", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Épée" }));
    await user.click(within(screen.getByRole("toolbar", { name: "Sélection" })).getByRole("button", { name: "Rareté" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rare" }));

    await waitFor(() => expect(actions.setWorldCatalogItemsRarity).toHaveBeenCalledWith(["i-epee"], "rare"));
    expect(actions.updateWorldCatalogItem).not.toHaveBeenCalled();
  });

  it("garde sélectionnés les objets que la base a refusés", async () => {
    actions.trashWorldCatalogItems.mockResolvedValueOnce({ ok: true, ids: ["i-epee"] });
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Épée" }));
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Arc" }));
    await user.click(within(screen.getByRole("toolbar", { name: "Sélection" })).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(screen.queryByText("Épée")).toBeNull());
    // L'arc, refusé, reste à l'écran et sélectionné.
    expect(screen.getByText("Arc")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Sélectionner Arc" })).toBeChecked();
  });

  it("« Tout sélectionner » prend les objets visibles, la croix vide la sélection", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Épée" }));
    const barre = screen.getByRole("toolbar", { name: "Sélection" });
    await user.click(within(barre).getByRole("button", { name: "Tout sélectionner" }));
    expect(within(barre).getByText(/^4 /)).toBeInTheDocument();
    expect(within(barre).queryByRole("button", { name: "Tout sélectionner" })).toBeNull();

    await user.click(within(barre).getByRole("button", { name: "Annuler la sélection" }));
    expect(screen.queryByRole("toolbar", { name: "Sélection" })).toBeNull();
  });

  it("n'offre ni case ni menu hors du mode édition", async () => {
    mount({ canEdit: false });
    await screen.findByText("Potion");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Actions pour/ })).toBeNull();
  });

  it("replie une catégorie, garde son compte, et s'en souvient", async () => {
    const user = userEvent.setup();
    const { unmount } = mount({ canEdit: false });
    await screen.findByText("Épée");

    await user.click(screen.getByRole("button", { name: "Replier Armes" }));
    expect(screen.queryByText("Épée")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Armes" })).getByTitle(/^2 /)).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "Déplier Armes" })).toHaveAttribute("aria-expanded", "false");
    expect([...loadCollapsedCategories("w1", "inventory")]).toEqual(["cat-armes"]);
    unmount();

    // Remonté : le repli est relu depuis l'appareil.
    mount({ canEdit: false });
    await screen.findByText("Potion");
    await waitFor(() => expect(screen.queryByText("Épée")).toBeNull());
    expect(screen.getByText("Outils")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Déplier Armes" }));
    expect(screen.getByText("Épée")).toBeInTheDocument();
  });

  it("une recherche déplie ce qui est replié, pour montrer ses résultats", async () => {
    const user = userEvent.setup();
    mount({ canEdit: false });
    await screen.findByText("Épée");

    await user.click(screen.getByRole("button", { name: "Replier Armes" }));
    expect(screen.queryByText("Épée")).toBeNull();

    await user.type(screen.getByRole("textbox", { name: "Rechercher" }), "épée");
    expect(screen.getByText("Épée")).toBeInTheDocument();
  });

  it("un objet déplacé vers une catégorie repliée la déplie", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(screen.getByRole("button", { name: "Replier Outils" }));
    await user.click(screen.getByRole("button", { name: "Actions pour Potion" }));
    await chooseInSubmenu(user, "Déplacer vers", "Outils");

    await waitFor(() => expect(screen.getByRole("button", { name: "Replier Outils" })).toBeInTheDocument());
    expect(loadCollapsedCategories("w1", "inventory").size).toBe(0);
  });

  it("crée un objet dans le dialogue, avec un identifiant tiré d'avance et sa catégorie", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(within(screen.getByRole("region", { name: "Armes" })).getByRole("button", { name: "Ajouter un objet" }));
    const dialogue = await screen.findByRole("dialog", { name: "Nouvel objet" });
    await user.type(within(dialogue).getByPlaceholderText("Nom de l'objet"), "Dague");
    await user.click(within(dialogue).getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(actions.addWorldCatalogItem).toHaveBeenCalledWith(
      "w1",
      "inventory",
      expect.objectContaining({ name: "Dague", category_id: "cat-armes" }),
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    );
    expect(screen.getByText("Dague")).toBeInTheDocument();
  });

  it("« Créer et continuer » enregistre puis rouvre un brouillon vide", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(within(screen.getByRole("region", { name: "Sans catégorie" })).getByRole("button", { name: "Ajouter un objet" }));
    const dialogue = await screen.findByRole("dialog", { name: "Nouvel objet" });
    const nom = within(dialogue).getByPlaceholderText("Nom de l'objet");
    await user.type(nom, "Torche");
    await user.click(within(dialogue).getByRole("button", { name: "Créer et continuer" }));

    await waitFor(() => expect(screen.getByText("Torche")).toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Nouvel objet" })).toBeInTheDocument();
    await waitFor(() => expect(within(dialogue).getByPlaceholderText("Nom de l'objet")).toHaveValue(""));
    const [premier] = actions.addWorldCatalogItem.mock.calls;
    expect(premier[2]).toEqual(expect.objectContaining({ category_id: null }));
  });
});

describe("CatalogueList — présentation d'une catégorie (migration 185)", () => {
  const RELIQUES = { ...ARMES, description: "Les **reliques** du Nord.", banner_url: "https://cdn.test/worlds/world-w1/category-cat-armes/banner.webp" };

  beforeEach(() => {
    localStorage.clear();
    actions.updateWorldCatalogCategory.mockReset().mockResolvedValue({ ok: true });
  });

  it("dépliée, la catégorie montre sa bannière et sa description ; repliée, plus rien", async () => {
    const user = userEvent.setup();
    mount({ categories: [RELIQUES, OUTILS] });
    await screen.findByText("Épée");

    const presentation = screen.getByTestId("category-presentation");
    expect(within(presentation).getByText("reliques")).toBeInTheDocument();
    expect(presentation.querySelector("img")).not.toBeNull();
    // Outils n'a rien à présenter : pas de bloc.
    expect(screen.getAllByTestId("category-presentation")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Replier Armes" }));
    expect(screen.queryByTestId("category-presentation")).toBeNull();
  });

  it("le crayon ouvre la présentation ; l'enregistrement met à jour l'en-tête", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Épée");

    await user.click(screen.getByRole("button", { name: "Modifier la catégorie Armes" }));
    const dialog = await screen.findByRole("dialog", { name: "Présentation de la catégorie" });
    const name = within(dialog).getByLabelText("Nom");
    await user.clear(name);
    await user.type(name, "Armurerie");
    await user.type(within(dialog).getByLabelText("Description"), "Tout ce qui tranche.");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(actions.updateWorldCatalogCategory).toHaveBeenCalledWith("cat-armes", {
      name: "Armurerie", description: "Tout ce qui tranche.", banner_url: null,
    }));
    expect(await screen.findByText("Armurerie")).toBeInTheDocument();
    expect(within(screen.getByTestId("category-presentation")).getByText("Tout ce qui tranche.")).toBeInTheDocument();
  });
});
