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
vi.mock("@/components/providers/CurrentUserProvider", () => ({ useCurrentUser: () => ({ userId: "u1" }) }));

import { WorldShops } from "@/components/worlds/shops/WorldShops";
import { useWorldShops } from "@/hooks/useWorldShops";
import { toast } from "sonner";

const UNITS = [
  { name: "Or", short: "po", value: 100 },
  { name: "Argent", short: "pa", value: 1 },
];
const forge = { id: "s1", world_id: "w1", name: "Forge", description: "Lames et armures", lucide_icon: null, is_open: true, buyback_enabled: true, buyback_percent: 50, sort_index: 0 };
const cave = { ...forge, id: "s2", name: "Cave", description: null, is_open: false, buyback_enabled: false };
const entry = (id: string, name: string) => ({ id, name, description: null, icon: null, lucide_icon: null, image_url: null, rarity: null, stackable: true, max_quantity: null, deleted_at: null });
const epee = { id: "i1", shop_id: "s1", catalog_item_id: "c1", price: 250, stock: null, buyback_price: null, sort_index: 0, catalog: entry("c1", "Épée") };
const casque = { id: "i2", shop_id: "s1", catalog_item_id: "c2", price: 100, stock: 0, buyback_price: null, sort_index: 1, catalog: entry("c2", "Casque") };

function shops(patch: Record<string, unknown> = {}) {
  const state = {
    status: "on",
    buyback: true,
    units: UNITS,
    shops: [forge, cave],
    itemsOf: (id: string) => (id === "s1" ? [epee, casque] : []),
    personas: [{ id: "p1", name: "Brom", avatar_url: null, balance: 1000 }],
    held: (_p: string, c: string) => (c === "c1" ? 2 : 0),
    catalog: [
      { ...entry("c1", "Épée"), world_id: "w1", type: "inventory", sort_index: 0 },
      { ...entry("c3", "Bouclier"), world_id: "w1", type: "inventory", sort_index: 1 },
    ],
    categories: [],
    buy: vi.fn(async () => ({ ok: true })),
    sell: vi.fn(async () => ({ ok: true })),
    reload: vi.fn(async () => {}),
    ...patch,
  };
  vi.mocked(useWorldShops).mockReturnValue(state as never);
  return state;
}

function renderShops(canManage = false) {
  return render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <WorldShops worldId="w1" canManage={canManage} />
    </NextIntlClientProvider>,
  );
}

const card = (name: string) => screen.getByRole("article", { name });

beforeEach(() => vi.clearAllMocks());

describe("WorldShops (migration 249)", () => {
  it("économie ou inventaire coupés : le dit", () => {
    shops({ status: "off" });
    renderShops();
    expect(screen.getByText(/l’économie, l’inventaire et l’option Boutiques/)).toBeInTheDocument();
  });

  it("une boutique par onglet ; ses articles, leur prix, leur stock", () => {
    shops();
    renderShops();
    expect(screen.getByRole("tab", { name: "Forge" })).toBeInTheDocument();
    expect(screen.getByText("Lames et armures")).toBeInTheDocument();
    expect(within(card("Épée")).getByText("2 po 50 pa")).toBeInTheDocument();
    expect(within(card("Épée")).getByText("2 sur vous")).toBeInTheDocument();
    expect(within(card("Casque")).getByText("Épuisé")).toBeInTheDocument();
    expect(within(card("Casque")).getByRole("button", { name: "Acheter" })).toBeDisabled();
  });

  it("une boutique fermée (vue par qui gère l'économie) porte un cadenas", () => {
    shops();
    renderShops(true);
    expect(screen.getByRole("tab", { name: /Cave/ })).toHaveTextContent("Fermée");
  });

  it("acheter : quantité, total, puis la RPC pour le persona choisi", async () => {
    const state = shops();
    const user = userEvent.setup();
    renderShops();
    await user.click(within(card("Épée")).getByRole("button", { name: "Acheter" }));
    const dialog = await screen.findByRole("dialog", { name: "Acheter : Épée" });
    expect(within(dialog).getByRole("spinbutton", { name: "Quantité" })).toHaveValue(1);
    // Le même champ que partout : les boutons −/+ à côté de la case.
    await user.click(within(dialog).getByRole("button", { name: "Augmenter : Quantité" }));
    expect(within(dialog).getByRole("spinbutton", { name: "Quantité" })).toHaveValue(2);
    expect(within(dialog).getByText("5 po")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Acheter" }));
    await waitFor(() => expect(state.buy).toHaveBeenCalledWith("p1", "i1", 2));
    expect(toast.success).toHaveBeenCalledWith("Achat effectué.");
  });

  it("un refus de la base s'affiche en clair", async () => {
    shops({ buy: vi.fn(async () => ({ ok: false, error: "funds" })) });
    const user = userEvent.setup();
    renderShops();
    await user.click(within(card("Épée")).getByRole("button", { name: "Acheter" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Acheter" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Solde insuffisant."));
  });

  it("revendre : seulement ce qu'on porte, au prix de revente", async () => {
    const state = shops();
    const user = userEvent.setup();
    renderShops();
    expect(within(card("Casque")).queryByRole("button", { name: "Revendre" })).toBeNull();
    expect(within(card("Épée")).getByText(/^Revente :/)).toHaveTextContent("Revente : 1 po 25 pa");
    await user.click(within(card("Épée")).getByRole("button", { name: "Revendre" }));
    const dialog = await screen.findByRole("dialog", { name: "Revendre : Épée" });
    await user.click(within(dialog).getByRole("button", { name: "Revendre" }));
    await waitFor(() => expect(state.sell).toHaveBeenCalledWith("p1", "i1", 1));
  });

  it("joueurs maîtres de leur inventaire : rien ne se revend", () => {
    shops({ buyback: false });
    renderShops();
    expect(within(card("Épée")).queryByRole("button", { name: "Revendre" })).toBeNull();
    expect(within(card("Épée")).queryByText(/^Revente :/)).toBeNull();
    expect(screen.queryByText("Revente acceptée")).toBeNull();
  });

  it("sans persona dans le monde : on regarde, on n'achète pas", () => {
    shops({ personas: [] });
    renderShops();
    expect(screen.getByText("Créez un persona dans ce monde pour acheter.")).toBeInTheDocument();
    expect(within(card("Épée")).getByRole("button", { name: "Acheter" })).toBeDisabled();
  });

  it("la gestion vit dans les paramètres : rien à modifier ici", () => {
    shops();
    renderShops(true);
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nouvelle boutique" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mettre en vente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Supprimer la boutique" })).toBeNull();
  });
});
