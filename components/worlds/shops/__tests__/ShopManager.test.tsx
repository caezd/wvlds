import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import fr from "@/messages/fr.json";

vi.mock("@/hooks/useWorldShops", () => ({ useWorldShops: vi.fn() }));
vi.mock("@/app/actions/worldShops", () => ({
  addWorldShop: vi.fn(async () => ({ ok: true, shop: {} })),
  updateWorldShop: vi.fn(async () => ({ ok: true })),
  deleteWorldShop: vi.fn(async () => ({ ok: true })),
  addWorldShopItem: vi.fn(async () => ({ ok: true, item: {} })),
  updateWorldShopItem: vi.fn(async () => ({ ok: true })),
  removeWorldShopItem: vi.fn(async () => ({ ok: true })),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ShopManager } from "@/components/worlds/shops/ShopManager";
import { useWorldShops } from "@/hooks/useWorldShops";
import { addWorldShop, addWorldShopItem, deleteWorldShop, removeWorldShopItem } from "@/app/actions/worldShops";

const UNITS = [
  { name: "Or", short: "po", value: 100 },
  { name: "Argent", short: "pa", value: 1 },
];
const forge = { id: "s1", world_id: "w1", name: "Forge", description: "Lames et armures", lucide_icon: null, is_open: true, buyback_enabled: true, buyback_percent: 50, sort_index: 0 };
const cave = { ...forge, id: "s2", name: "Cave", description: null, is_open: false, buyback_enabled: false };
const entry = (id: string, name: string) => ({ id, name, description: null, icon: null, lucide_icon: null, image_url: null, rarity: null, stackable: true, max_quantity: null, deleted_at: null });
const epee = { id: "i1", shop_id: "s1", catalog_item_id: "c1", price: 250, stock: null, buyback_price: null, sort_index: 0, catalog: entry("c1", "Épée") };
const casque = { id: "i2", shop_id: "s1", catalog_item_id: "c2", price: 100, stock: 4, buyback_price: null, sort_index: 1, catalog: entry("c2", "Casque") };

function shops(patch: Record<string, unknown> = {}) {
  const state = {
    status: "on",
    units: UNITS,
    shops: [forge, cave],
    itemsOf: (id: string) => (id === "s1" ? [epee, casque] : []),
    personas: [],
    held: () => 0,
    catalog: [
      { ...entry("c1", "Épée"), world_id: "w1", type: "inventory", sort_index: 0 },
      { ...entry("c3", "Bouclier"), world_id: "w1", type: "inventory", sort_index: 1 },
    ],
    categories: [],
    buy: vi.fn(),
    sell: vi.fn(),
    reload: vi.fn(async () => {}),
    ...patch,
  };
  vi.mocked(useWorldShops).mockReturnValue(state as never);
  return state;
}

function renderManager() {
  return render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <ShopManager worldId="w1" />
    </NextIntlClientProvider>,
  );
}

const shop = (name: string) => screen.getByRole("region", { name });

beforeEach(() => vi.clearAllMocks());

describe("ShopManager — les boutiques, depuis les paramètres", () => {
  it("lit en gestionnaire, sans persona acheteur", () => {
    shops();
    renderManager();
    expect(useWorldShops).toHaveBeenCalledWith("w1", null, true);
  });

  it("chaque boutique, ses articles, leur prix et leur stock", () => {
    shops();
    renderManager();
    const f = shop("Forge");
    expect(within(f).getByText("Lames et armures")).toBeInTheDocument();
    const lignes = within(f).getAllByRole("listitem");
    expect(lignes.map((l) => l.getAttribute("aria-label"))).toEqual(["Épée", "Casque"]);
    expect(within(lignes[0]).getByText("2 po 50 pa")).toBeInTheDocument();
    expect(within(lignes[0]).getByText("Illimité")).toBeInTheDocument();
    expect(within(lignes[1]).getByText("4 en stock")).toBeInTheDocument();
    expect(within(shop("Cave")).getByText("Rien en vente.")).toBeInTheDocument();
    expect(within(shop("Cave")).getByText("Fermée")).toBeInTheDocument();
  });

  it("crée une boutique", async () => {
    const state = shops();
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole("button", { name: "Nouvelle boutique" }));
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle boutique" });
    await user.type(within(dialog).getByLabelText("Nom"), "Herboriste");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(addWorldShop).toHaveBeenCalledWith("w1", expect.objectContaining({ name: "Herboriste" })));
    expect(state.reload).toHaveBeenCalled();
  });

  it("met un objet en vente dans une boutique", async () => {
    shops();
    const user = userEvent.setup();
    renderManager();
    await user.click(within(shop("Forge")).getByRole("button", { name: "Mettre en vente" }));
    // L'épée est déjà en vente ici : seul le bouclier est proposé.
    expect(within(await screen.findByRole("dialog")).queryByRole("button", { name: /Épée/ })).toBeNull();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Bouclier/ }));
    const dialog = await screen.findByRole("dialog", { name: "Article : Bouclier" });
    await user.type(within(dialog).getByRole("spinbutton", { name: "Prix en Or" }), "3");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(addWorldShopItem).toHaveBeenCalledWith("s1", "c3", { price: 300, stock: null, buyback_price: null }));
  });

  it("retire un article de la vente", async () => {
    const state = shops();
    const user = userEvent.setup();
    renderManager();
    await user.click(within(shop("Forge")).getByRole("button", { name: "Retirer de la vente : Casque" }));
    await waitFor(() => expect(removeWorldShopItem).toHaveBeenCalledWith("i2"));
    expect(state.reload).toHaveBeenCalled();
  });

  it("supprime une boutique après confirmation", async () => {
    shops();
    const user = userEvent.setup();
    renderManager();
    await user.click(within(shop("Cave")).getByRole("button", { name: "Supprimer la boutique" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: /Supprimer/ }));
    await waitFor(() => expect(deleteWorldShop).toHaveBeenCalledWith("s2"));
  });

  it("option coupée : le dit", () => {
    shops({ status: "off" });
    renderManager();
    expect(screen.getByText(/l’option Boutiques/)).toBeInTheDocument();
  });
});
