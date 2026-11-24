import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const setWorldLiveChatConnection = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldLiveChatConnection: (...args: unknown[]) => setWorldLiveChatConnection(...args),
}));

import { WorldLiveChatConnectionSettings } from "@/components/worlds/settings/WorldLiveChatConnectionSettings";
import type { World } from "@/types/worlds";

const monde = (patch: Partial<World> = {}) => ({ id: "w1", name: "Monde", ...patch }) as World;
const champ = (name: string) => screen.getByRole("combobox", { name });

async function choisir(name: string, libelle: string) {
  const user = userEvent.setup();
  await user.click(champ(name));
  await user.click(await screen.findByRole("option", { name: libelle }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setWorldLiveChatConnection.mockResolvedValue({ ok: true });
});

describe("WorldLiveChatConnectionSettings (migration 244)", () => {
  it("par défaut : connexion à l'arrivée, jamais déconnecté, ne peut rien lire déconnecté (sans objet)", () => {
    render(<WorldLiveChatConnectionSettings world={monde()} />);
    expect(champ("Connexion")).toHaveTextContent("Dès l'arrivée dans le monde");
    expect(champ("Déconnexion pour inactivité")).toHaveTextContent("Jamais");
    expect(champ("Lecture déconnecté")).toHaveTextContent("Ne peut rien lire");
    // Connecté dès l'arrivée : ni déconnexion, ni vue sans connexion.
    expect(champ("Déconnexion pour inactivité")).toBeDisabled();
    expect(champ("Lecture déconnecté")).toBeDisabled();
  });

  it("dès l'arrivée, un délai enregistré reste affiché mais grisé", () => {
    render(<WorldLiveChatConnectionSettings world={monde({ live_chat_idle_minutes: 30 })} />);
    expect(champ("Déconnexion pour inactivité")).toHaveTextContent("Après 30 minutes");
    expect(champ("Déconnexion pour inactivité")).toBeDisabled();
  });

  it("propose les délais d'inactivité", async () => {
    render(<WorldLiveChatConnectionSettings world={monde({ live_chat_join_mode: "button" })} />);
    await userEvent.setup().click(champ("Déconnexion pour inactivité"));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Jamais",
      "Après 5 minutes",
      "Après 10 minutes",
      "Après 15 minutes",
      "Après 30 minutes",
      "Après 1 heure",
      "Après 2 heures",
    ]);
  });

  it("le bouton Rejoindre s'enregistre, et rend la déconnexion et la vue sans connexion réglables", async () => {
    const onUpdated = vi.fn();
    render(<WorldLiveChatConnectionSettings world={monde()} onUpdated={onUpdated} />);
    await choisir("Connexion", "En cliquant sur Rejoindre");
    expect(setWorldLiveChatConnection).toHaveBeenCalledWith("w1", { live_chat_join_mode: "button" });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ live_chat_join_mode: "button" }));
    expect(champ("Déconnexion pour inactivité")).toBeEnabled();
    expect(champ("Lecture déconnecté")).toBeEnabled();
    await choisir("Lecture déconnecté", "Lecture seule");
    expect(setWorldLiveChatConnection).toHaveBeenLastCalledWith("w1", { live_chat_offline_view: "read" });
  });

  it("un délai, puis « Jamais »", async () => {
    render(<WorldLiveChatConnectionSettings world={monde({ live_chat_join_mode: "button", live_chat_idle_minutes: 30 })} />);
    expect(champ("Déconnexion pour inactivité")).toHaveTextContent("Après 30 minutes");
    await choisir("Déconnexion pour inactivité", "Jamais");
    expect(setWorldLiveChatConnection).toHaveBeenCalledWith("w1", { live_chat_idle_minutes: null });
  });

  it("revient à la valeur précédente si l'enregistrement échoue", async () => {
    setWorldLiveChatConnection.mockResolvedValue({ ok: false, error: "saveFailed" });
    const onUpdated = vi.fn();
    render(<WorldLiveChatConnectionSettings world={monde({ live_chat_join_mode: "button" })} onUpdated={onUpdated} />);
    await choisir("Déconnexion pour inactivité", "Après 15 minutes");
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(champ("Déconnexion pour inactivité")).toHaveTextContent("Jamais");
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
