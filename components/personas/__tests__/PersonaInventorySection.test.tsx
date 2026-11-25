import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PersonaInventorySection, type PersonaInventory } from "@/components/personas/PersonaInventorySection";
import type { InventoryRow } from "@/hooks/usePersonaInventory";

const UNITS = [
  { name: "Argent", short: "pa", value: 100 },
  { name: "Cuivre", short: "pc", value: 1 },
];
const epee = {
  id: "c-epee", name: "Épée", description: "Tranchante", icon: null, lucide_icon: "sword", image_url: null,
  rarity: null, stackable: false, max_quantity: null, deleted_at: null,
};
const ligne = (id: string, patch: Partial<InventoryRow>): InventoryRow => ({
  id, catalog_item_id: null, name: null, description: null, icon: null, lucide_icon: null, quantity: 1, sort_index: 0, catalog: null, ...patch,
});

const actions = {
  addCustom: vi.fn(),
  addCatalog: vi.fn(),
  setQuantity: vi.fn(),
  removeRow: vi.fn(),
  updateCustom: vi.fn(),
  give: vi.fn(),
  extend: vi.fn(),
};
const inventaire = (over: Partial<PersonaInventory> = {}): PersonaInventory => ({
  status: "on",
  mode: "free",
  economyOn: true,
  items: [
    ligne("r1", { name: "Corde", quantity: 2 }),
    ligne("r2", { catalog_item_id: "c-epee", catalog: epee }),
  ],
  used: 2,
  capacity: 4,
  extension: { cost: 250, remaining: 3 },
  catalog: [{ ...epee, world_id: "w1", type: "inventory", sort_index: 0, stackable: false }],
  categories: [],
  ...actions,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(actions)) fn.mockResolvedValue({ ok: true });
});

function rendre(over: Partial<PersonaInventory> = {}, props: { canEdit?: boolean; canManage?: boolean; onSpent?: () => void } = {}) {
  return render(
    <PersonaInventorySection
      personaName="Lia"
      inventory={inventaire(over)}
      units={UNITS}
      canEdit={props.canEdit ?? true}
      canManage={props.canManage ?? false}
      onSpent={props.onSpent}
    />,
  );
}

describe("PersonaInventorySection (migration 247)", () => {
  it("liste les objets, leur quantité, et les emplacements occupés", () => {
    rendre();
    const items = within(screen.getByRole("list", { name: "Objets" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Corde");
    expect(items[0]).toHaveTextContent("×2");
    expect(items[1]).toHaveTextContent("Épée");
    expect(screen.getByText("2 / 4 emplacements")).toBeInTheDocument();
  });

  it("sans limite, ne compte que les emplacements occupés", () => {
    rendre({ capacity: null, extension: null });
    expect(screen.getByText("2 emplacements")).toBeInTheDocument();
  });

  it("inventaire vide : le dit", () => {
    rendre({ items: [], used: 0 });
    expect(screen.getByText("Aucun objet.")).toBeInTheDocument();
  });

  it("mode libre : le joueur crée un objet", async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole("button", { name: "Objet libre" }));
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "Lanterne");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(actions.addCustom).toHaveBeenCalledWith("Lanterne", "");
  });

  it("le joueur pioche parmi les objets du monde", async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole("button", { name: "Ajouter un objet du monde" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Épée/ }));
    expect(actions.addCatalog).toHaveBeenCalledWith("c-epee", 1);
  });

  it("objets du monde seulement : pas d'objet libre", () => {
    rendre({ mode: "catalog" });
    expect(screen.queryByRole("button", { name: "Objet libre" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ajouter un objet du monde" })).toBeInTheDocument();
  });

  it("aucun objet dans le monde : rien à y piocher, pas de bouton", () => {
    rendre({ catalog: [] });
    expect(screen.queryByRole("button", { name: /catalogue/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Objet libre" })).toBeInTheDocument();
  });

  it("mode tenu : le joueur ne touche à rien", () => {
    rendre({ mode: "held" });
    expect(screen.queryByRole("button", { name: "Objet libre" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ajouter un objet du monde" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Retirer/ })).toBeNull();
  });

  it("mode tenu : qui gère l'économie donne un objet du monde", async () => {
    const user = userEvent.setup();
    rendre({ mode: "held" }, { canEdit: false, canManage: true });
    await user.click(screen.getByRole("button", { name: "Donner un objet" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Épée/ }));
    expect(actions.give).toHaveBeenCalledWith("c-epee", 1);
  });

  it("ajuste la quantité d'une ligne, et la retire", async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole("button", { name: "Un de plus : Corde" }));
    expect(actions.setQuantity).toHaveBeenCalledWith("r1", 3);
    await user.click(screen.getByRole("button", { name: "Retirer : Corde" }));
    expect(actions.removeRow).toHaveBeenCalledWith("r1");
  });

  it("agrandir annonce le prix, paie, puis prévient la bourse", async () => {
    const user = userEvent.setup();
    const onSpent = vi.fn();
    rendre({}, { onSpent });
    await user.click(screen.getByRole("button", { name: "Agrandir" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("2 pa 50 pc");
    await user.click(screen.getByRole("button", { name: "Payer" }));
    expect(actions.extend).toHaveBeenCalledWith(1);
    expect(onSpent).toHaveBeenCalled();
  });

  it("un refus de la base est dit", async () => {
    const user = userEvent.setup();
    actions.addCatalog.mockResolvedValue({ ok: false, error: "full" });
    rendre();
    await user.click(screen.getByRole("button", { name: "Ajouter un objet du monde" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Épée/ }));
    expect(toast.error).toHaveBeenCalledWith("Inventaire plein.");
  });

  it("pour un visiteur, la liste seule", () => {
    rendre({}, { canEdit: false });
    expect(screen.queryByRole("button", { name: "Objet libre" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Agrandir" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Un de plus/ })).toBeNull();
  });
});
