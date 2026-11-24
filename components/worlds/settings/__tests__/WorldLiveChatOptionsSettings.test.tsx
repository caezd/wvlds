import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import type { World } from "@/types/worlds";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const setWorldFeature = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldFeature: (...args: unknown[]) => setWorldFeature(...args),
}));

import { WorldLiveChatOptionsSettings } from "@/components/worlds/settings/WorldLiveChatOptionsSettings";

const MONDE = { id: "w1", name: "Veldis" } as World;

beforeEach(() => {
  vi.clearAllMocks();
  setWorldFeature.mockResolvedValue({ ok: true });
});

describe("WorldLiveChatOptionsSettings (migration 241)", () => {
  it("quatre options, éteintes par défaut", () => {
    render(<WorldLiveChatOptionsSettings world={MONDE} />);
    for (const name of ["Couleurs de dialogue", "Bulles", "Écrire avec un persona", "Actions /me"]) {
      expect(screen.getByRole("switch", { name })).toHaveAttribute("aria-checked", "false");
    }
  });

  it("montre l'état du monde", () => {
    render(<WorldLiveChatOptionsSettings world={{ ...MONDE, live_chat_bubbles: true, live_chat_actions: true }} />);
    expect(screen.getByRole("switch", { name: "Bulles" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Actions /me" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Couleurs de dialogue" })).toHaveAttribute("aria-checked", "false");
  });

  it("une bascule s'enregistre pour le monde et se remonte", async () => {
    const onUpdated = vi.fn();
    render(<WorldLiveChatOptionsSettings world={MONDE} onUpdated={onUpdated} />);
    await userEvent.setup().click(screen.getByRole("switch", { name: "Écrire avec un persona" }));
    expect(setWorldFeature).toHaveBeenCalledWith("w1", "live_chat_personas", true);
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ live_chat_personas: true }));
  });

  it("un échec ramène l'option où elle était", async () => {
    setWorldFeature.mockResolvedValue({ ok: false, error: "saveFailed" });
    render(<WorldLiveChatOptionsSettings world={MONDE} />);
    const sw = screen.getByRole("switch", { name: "Couleurs de dialogue" });
    await userEvent.setup().click(sw);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(sw).toHaveAttribute("aria-checked", "false");
  });
});
