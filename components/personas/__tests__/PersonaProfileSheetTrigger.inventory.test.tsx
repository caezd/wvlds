import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: null }) }));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => "offline" }),
}));
const flags = { world_economy: true };
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({ useFeatureFlags: () => flags }));
const usePersonaWallet = vi.fn();
vi.mock("@/hooks/usePersonaWallet", () => ({
  usePersonaWallet: (...args: unknown[]) => usePersonaWallet(...args),
}));

const usePersonaInventory = vi.fn();
vi.mock("@/hooks/usePersonaInventory", () => ({
  usePersonaInventory: (...args: unknown[]) => usePersonaInventory(...args),
}));

import { PersonaProfileSheetTrigger } from "@/components/personas/PersonaProfileSheetTrigger";

const PERSONA = {
  id: "p1", user_id: "u1", name: "Kael", avatar_url: null, banner_url: null,
  dialogue_color: null, world_id: "w1", frame: null,
};
const wallet = (status: "loading" | "off" | "on") => ({
  status,
  units: [{ name: "Pièce", short: "", value: 1 }],
  balance: 42,
  ledger: [],
  adjust: vi.fn(),
});

const inventory = (status: "loading" | "off" | "on") => ({
  status,
  mode: "free",
  economyOn: false,
  items: [{ id: "r1", catalog_item_id: null, name: "Corde", description: null, icon: null, lucide_icon: null, quantity: 1, sort_index: 0, catalog: null }],
  used: 1,
  capacity: null,
  extension: null,
  catalog: [],
  categories: [],
  addCustom: vi.fn(), addCatalog: vi.fn(), setQuantity: vi.fn(), removeRow: vi.fn(),
  updateCustom: vi.fn(), give: vi.fn(), extend: vi.fn(),
});

async function ouvrir() {
  vi.mocked(createClient).mockReturnValue(createSupabaseMock({ results: [{ data: PERSONA }] }).client as never);
  render(
    <PersonaProfileSheetTrigger personaId="p1" userId={null} label="Kael">
      <span>ouvrir</span>
    </PersonaProfileSheetTrigger>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Kael" }));
  await screen.findByText("Kael", { selector: "p" });
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.world_economy = true;
  usePersonaInventory.mockReturnValue(inventory("off"));
});

describe("PersonaProfileSheetTrigger — inventaire (migrations 246-247)", () => {
  it("un onglet Inventaire porte la bourse quand l'économie du monde est active", async () => {
    usePersonaWallet.mockReturnValue(wallet("on"));
    await ouvrir();
    await waitFor(() => expect(usePersonaWallet).toHaveBeenLastCalledWith("p1", "w1"));
    await userEvent.click(await screen.findByRole("tab", { name: /Inventaire/ }));
    expect(await screen.findByTestId("persona-wallet-balance")).toHaveTextContent("42 Pièce");
  });

  it("et les objets quand l'inventaire du monde est actif", async () => {
    usePersonaWallet.mockReturnValue(wallet("off"));
    usePersonaInventory.mockReturnValue(inventory("on"));
    await ouvrir();
    await waitFor(() => expect(usePersonaInventory).toHaveBeenLastCalledWith("p1", "w1"));
    await userEvent.click(await screen.findByRole("tab", { name: /Inventaire/ }));
    expect(await screen.findByText("Corde")).toBeInTheDocument();
    expect(screen.queryByTestId("persona-wallet-balance")).toBeNull();
  });

  it("pas d'onglet quand ni l'un ni l'autre", async () => {
    usePersonaWallet.mockReturnValue(wallet("off"));
    await ouvrir();
    await screen.findByRole("tab", { name: /Relations/ });
    expect(screen.queryByRole("tab", { name: /Inventaire/ })).toBeNull();
  });

  it("drapeau éteint : la bourse n'est pas lue", async () => {
    flags.world_economy = false;
    usePersonaWallet.mockReturnValue(wallet("off"));
    await ouvrir();
    expect(usePersonaWallet).not.toHaveBeenCalledWith("p1", "w1");
  });
});
