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
  reorderWorldCatalogItems: vi.fn(),
  trashWorldCatalogItem: vi.fn(),
  updateWorldCatalogItem: vi.fn(),
}));
vi.mock("@/app/actions/worldCatalog", () => ({
  addWorldCatalogItem: vi.fn(),
  updateWorldCatalogItem: actions.updateWorldCatalogItem,
  trashWorldCatalogItem: actions.trashWorldCatalogItem,
  restoreWorldCatalogItem: vi.fn(),
  purgeWorldCatalogItem: vi.fn(),
  listTrashedWorldCatalogItems: vi.fn(),
  duplicateWorldCatalogItem: vi.fn(),
  addWorldCatalogCategory: vi.fn(),
  updateWorldCatalogCategory: vi.fn(),
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

function mount(props: { canEdit?: boolean } = {}) {
  vi.mocked(createClient).mockReturnValue(
    createSupabaseMock({ results: [{ data: [ARMES, OUTILS] }, { data: [EPEE, ARC, POTION, CORDE] }] }) as never,
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

describe("CatalogueList — gestion", () => {
  beforeEach(() => {
    localStorage.clear();
    actions.reorderWorldCatalogItems.mockReset().mockResolvedValue({ ok: true });
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
    expect(actions.trashWorldCatalogItem).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("toolbar", { name: "Sélection" })).toBeNull();
  });

  it("change la rareté de la sélection", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Potion");

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner Épée" }));
    await user.click(within(screen.getByRole("toolbar", { name: "Sélection" })).getByRole("button", { name: "Rareté" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rare" }));

    await waitFor(() => expect(actions.updateWorldCatalogItem).toHaveBeenCalledWith("i-epee", { rarity: "rare" }));
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
    expect(screen.getByTitle(/^2 /)).toHaveTextContent("2");
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
});
