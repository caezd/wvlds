import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const setWorldLiveChatRetention = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldLiveChatRetention: (...args: unknown[]) => setWorldLiveChatRetention(...args),
}));

import { WorldLiveChatRetentionSetting } from "@/components/worlds/settings/WorldLiveChatRetentionSetting";

const champ = () => screen.getByRole("combobox", { name: "Messages conservés" });

async function choisir(libelle: string) {
  const user = userEvent.setup();
  await user.click(champ());
  await user.click(await screen.findByRole("option", { name: libelle }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setWorldLiveChatRetention.mockResolvedValue({ ok: true });
});

describe("WorldLiveChatRetentionSetting (migrations 239 et 240)", () => {
  it("affiche 100 quand le monde n'a pas la valeur chargée", () => {
    render(<WorldLiveChatRetentionSetting worldId="w1" value={undefined} />);
    expect(champ()).toHaveTextContent("100 messages par salle");
  });

  it("propose les trois paliers", async () => {
    render(<WorldLiveChatRetentionSetting worldId="w1" value={100} />);
    await userEvent.setup().click(champ());
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "25 messages par salle",
      "50 messages par salle",
      "100 messages par salle",
    ]);
  });

  it("enregistre le palier choisi et le remonte", async () => {
    const onSaved = vi.fn();
    render(<WorldLiveChatRetentionSetting worldId="w1" value={100} onSaved={onSaved} />);
    await choisir("25 messages par salle");
    expect(setWorldLiveChatRetention).toHaveBeenCalledWith("w1", 25);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(25));
    expect(champ()).toHaveTextContent("25 messages par salle");
  });

  it("revient à la valeur précédente si l'enregistrement échoue", async () => {
    setWorldLiveChatRetention.mockResolvedValue({ ok: false, error: "saveFailed" });
    const onSaved = vi.fn();
    render(<WorldLiveChatRetentionSetting worldId="w1" value={50} onSaved={onSaved} />);
    await choisir("100 messages par salle");
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(champ()).toHaveTextContent("50 messages par salle");
    expect(onSaved).not.toHaveBeenCalled();
  });
});
