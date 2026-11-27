import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const listWorldDice = vi.fn();
const createWorldDie = vi.fn();
const updateWorldDie = vi.fn();
const deleteWorldDie = vi.fn();
const setWorldDiceRules = vi.fn();
const setWorldDieFaces = vi.fn();
vi.mock("@/app/actions/worldDice", () => ({
  listWorldDice: (...a: unknown[]) => listWorldDice(...a),
  createWorldDie: (...a: unknown[]) => createWorldDie(...a),
  updateWorldDie: (...a: unknown[]) => updateWorldDie(...a),
  deleteWorldDie: (...a: unknown[]) => deleteWorldDie(...a),
  setWorldDiceRules: (...a: unknown[]) => setWorldDiceRules(...a),
  setWorldDieFaces: (...a: unknown[]) => setWorldDieFaces(...a),
}));
// Le téléversement des faces : conversion et stockage simulés.
vi.mock("@/lib/imageUtils", async (original) => ({
  ...(await original<typeof import("@/lib/imageUtils")>()),
  toWebP: vi.fn(async (f: File) => f),
}));
const deposer = vi.fn();
const effacer = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => deposer(...a),
        remove: (...a: unknown[]) => effacer(...a),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/worlds/${p}` } }),
      }),
    },
  }),
}));

import { WorldDiceSettings } from "@/components/worlds/settings/WorldDiceSettings";
import type { World } from "@/types/worlds";
import type { WorldDie } from "@/lib/worldDice";

const D6: WorldDie = { id: "d6", world_id: "w1", name: "d6", min_value: 1, max_value: 6, hidden: false, position: 0, faces: [] };
const PEUR: WorldDie = { id: "peur", world_id: "w1", name: "Dé de peur", min_value: 0, max_value: 5, hidden: true, position: 1, faces: [] };
const IMG = "https://x.supabase.co/storage/v1/object/public/worlds/world-w1/dice/a.webp";
const monde = (patch: Partial<World> = {}) => ({ id: "w1", name: "Monde", dice_mode: "free", dice_allow_edit: false, ...patch }) as World;
const attendre = (ms = 800) => act(() => vi.advanceTimersByTimeAsync(ms));
const utilisateur = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  listWorldDice.mockResolvedValue({ ok: true, dice: [D6, PEUR] });
  createWorldDie.mockImplementation(async (_w: string, input: Omit<WorldDie, "id" | "world_id" | "position">) => ({
    ok: true,
    die: { id: `new-${input.name}`, world_id: "w1", position: 2, ...input, faces: [] },
  }));
  updateWorldDie.mockResolvedValue({ ok: true });
  deleteWorldDie.mockResolvedValue({ ok: true });
  setWorldDiceRules.mockResolvedValue({ ok: true });
  setWorldDieFaces.mockResolvedValue({ ok: true });
  deposer.mockResolvedValue({ error: null });
  effacer.mockResolvedValue({ error: null });
});
afterEach(() => vi.useRealTimers());

describe("WorldDiceSettings — les dés du monde (migration 270)", () => {
  it("liste les dés du monde, avec leur plage ; un dé masqué le dit", async () => {
    render(<WorldDiceSettings world={monde()} />);
    const liste = await screen.findByRole("region", { name: "Dés du monde" });
    expect(within(liste).getByRole("textbox", { name: "Nom du dé 1" })).toHaveValue("d6");
    expect(within(liste).getByRole("spinbutton", { name: "Minimum du dé 1" })).toHaveValue(1);
    expect(within(liste).getByRole("spinbutton", { name: "Maximum du dé 1" })).toHaveValue(6);
    expect(within(liste).getByRole("textbox", { name: "Nom du dé 2" })).toHaveValue("Dé de peur");
    expect(within(liste).getByRole("button", { name: "Masquer Dé de peur" })).toHaveAttribute("aria-pressed", "true");
    expect(within(liste).getByRole("button", { name: "Masquer d6" })).toHaveAttribute("aria-pressed", "false");
    expect(listWorldDice).toHaveBeenCalledWith("w1");
  });

  it("sans dé : l'état vide, qui propose d'en ajouter un", async () => {
    listWorldDice.mockResolvedValue({ ok: true, dice: [] });
    render(<WorldDiceSettings world={monde()} />);
    expect(await screen.findByText("Aucun dé pour l'instant.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouveau dé" })).toBeInTheDocument();
  });

  it("une action serveur qui échoue ne laisse pas la liste en chargement", async () => {
    listWorldDice.mockRejectedValue(new Error("Failed to fetch"));
    const { container } = render(<WorldDiceSettings world={monde()} />);
    expect(await screen.findByText("L'enregistrement a échoué")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="world-dice-loading"]')).toBeNull();
  });

  it("ajoute un dé standard d'un geste, depuis la grille", async () => {
    listWorldDice.mockResolvedValue({ ok: true, dice: [] });
    const user = utilisateur();
    render(<WorldDiceSettings world={monde()} />);
    await user.click(await screen.findByRole("button", { name: "Nouveau dé" }));
    const grille = await screen.findByRole("dialog", { name: "Nouveau dé" });
    for (const nom of ["d4", "d6", "d8", "d10", "d12", "d20", "d100", "Personnalisé"]) {
      expect(within(grille).getByRole("button", { name: nom })).toBeInTheDocument();
    }
    await user.click(within(grille).getByRole("button", { name: "d20" }));
    expect(createWorldDie).toHaveBeenCalledWith("w1", { name: "d20", min_value: 1, max_value: 20, hidden: false });
    expect(await screen.findByRole("textbox", { name: "Nom du dé 1" })).toHaveValue("d20");
    expect(screen.queryByRole("dialog", { name: "Nouveau dé" })).toBeNull();
  });

  it("un dé personnalisé part d'une plage de 1 à 6, à renommer", async () => {
    listWorldDice.mockResolvedValue({ ok: true, dice: [] });
    const user = utilisateur();
    render(<WorldDiceSettings world={monde()} />);
    await user.click(await screen.findByRole("button", { name: "Nouveau dé" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Personnalisé" }));
    expect(createWorldDie).toHaveBeenCalledWith("w1", { name: "Nouveau dé", min_value: 1, max_value: 6, hidden: false });
  });

  it("une modification valide s'enregistre d'elle-même, après le délai", async () => {
    const user = utilisateur();
    render(<WorldDiceSettings world={monde()} />);
    const max = await screen.findByRole("spinbutton", { name: "Maximum du dé 1" });
    await user.clear(max);
    await user.type(max, "8");
    await attendre();
    expect(updateWorldDie).toHaveBeenCalledTimes(1);
    expect(updateWorldDie).toHaveBeenCalledWith("d6", { name: "d6", min_value: 1, max_value: 8, hidden: false });
  });

  it("un minimum au-dessus du maximum ne part pas, et le dit", async () => {
    const user = utilisateur();
    render(<WorldDiceSettings world={monde()} />);
    const min = await screen.findByRole("spinbutton", { name: "Minimum du dé 1" });
    await user.clear(min);
    await user.type(min, "9");
    await attendre();
    expect(updateWorldDie).not.toHaveBeenCalled();
    expect(screen.getByText("Le minimum doit être inférieur au maximum.")).toBeInTheDocument();
  });

  it("masquer un dé s'enregistre", async () => {
    const user = utilisateur();
    render(<WorldDiceSettings world={monde()} />);
    await user.click(await screen.findByRole("button", { name: "Masquer d6" }));
    await attendre();
    expect(updateWorldDie).toHaveBeenCalledWith("d6", { name: "d6", min_value: 1, max_value: 6, hidden: true });
  });

  it("supprime un dé après confirmation", async () => {
    const user = utilisateur();
    render(<WorldDiceSettings world={monde()} />);
    await user.click(await screen.findByRole("button", { name: "Supprimer Dé de peur" }));
    const confirmation = await screen.findByRole("alertdialog");
    expect(confirmation).toHaveTextContent("Les lancers déjà publiés restent.");
    await user.click(within(confirmation).getByRole("button", { name: "Supprimer" }));
    expect(deleteWorldDie).toHaveBeenCalledWith("peur");
    expect(screen.queryByRole("textbox", { name: "Nom du dé 2" })).toBeNull();
  });
});

describe("WorldDiceSettings — les faces en image (migration 272)", () => {
  it("une face par valeur du dé, chacune avec son image à choisir", async () => {
    const user = utilisateur();
    render(<WorldDiceSettings world={monde()} />);
    await user.click(await screen.findByRole("button", { name: "Faces de d6" }));
    const fenetre = await screen.findByRole("dialog", { name: "Faces de « d6 »" });
    for (const v of [1, 2, 3, 4, 5, 6]) {
      expect(within(fenetre).getByLabelText(`Image de la face ${v}`)).toBeInTheDocument();
    }
    expect(within(fenetre).queryByLabelText("Image de la face 7")).toBeNull();
  });

  it("une image choisie part au stockage du monde, puis s'enregistre d'elle-même", async () => {
    const user = utilisateur();
    render(<WorldDiceSettings world={monde()} />);
    await user.click(await screen.findByRole("button", { name: "Faces de d6" }));
    const fenetre = await screen.findByRole("dialog");
    await user.upload(within(fenetre).getByLabelText("Image de la face 3"), new File(["x"], "f.png", { type: "image/png" }));
    expect(deposer).toHaveBeenCalledWith(expect.stringMatching(/^world-w1\/dice\//), expect.any(File), expect.anything());
    expect(await within(fenetre).findByRole("img", { name: "Face 3" })).toBeInTheDocument();
    await attendre();
    expect(setWorldDieFaces).toHaveBeenCalledWith("d6", [
      { value: 3, image: expect.stringMatching(/^https:\/\/x\.supabase\.co\/.*\/world-w1\/dice\//) },
    ]);
  });

  it("masquer le nombre d'une face, puis retirer son image", async () => {
    listWorldDice.mockResolvedValue({ ok: true, dice: [{ ...D6, faces: [{ value: 2, image: IMG }] }] });
    const user = utilisateur();
    render(<WorldDiceSettings world={monde()} />);
    await user.click(await screen.findByRole("button", { name: "Faces de d6" }));
    const fenetre = await screen.findByRole("dialog");
    const masquer = within(fenetre).getByRole("button", { name: "Masquer le nombre de la face 2" });
    expect(masquer).toHaveAttribute("aria-pressed", "false");
    await user.click(masquer);
    await attendre();
    expect(setWorldDieFaces).toHaveBeenLastCalledWith("d6", [{ value: 2, image: IMG, hide_value: true }]);

    await user.click(within(fenetre).getByRole("button", { name: "Retirer l'image de la face 2" }));
    await attendre();
    expect(setWorldDieFaces).toHaveBeenLastCalledWith("d6", []);
    expect(effacer).toHaveBeenCalledWith(["world-w1/dice/a.webp"]);
  });

  it("un dé de plus de 100 faces n'a pas d'images", async () => {
    listWorldDice.mockResolvedValue({ ok: true, dice: [{ ...D6, max_value: 1000 }] });
    const user = utilisateur();
    render(<WorldDiceSettings world={monde()} />);
    await user.click(await screen.findByRole("button", { name: "Faces de d6" }));
    const fenetre = await screen.findByRole("dialog");
    expect(within(fenetre).getByText("Les images de faces sont réservées aux dés de 100 faces au plus.")).toBeInTheDocument();
    expect(within(fenetre).queryByLabelText("Image de la face 1")).toBeNull();
  });
});

describe("WorldDiceSettings — les règles des lancers", () => {
  it("montre le mode du monde, et enregistre le passage aux dés du monde seulement", async () => {
    const user = utilisateur();
    const onUpdated = vi.fn();
    render(<WorldDiceSettings world={monde()} onUpdated={onUpdated} />);
    expect(screen.getByRole("radio", { name: /Formules libres/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: /Dés du monde seulement/ }));
    await attendre();
    expect(setWorldDiceRules).toHaveBeenCalledWith("w1", { dice_mode: "predefined", dice_allow_edit: false });
    expect(onUpdated).toHaveBeenCalledWith({ dice_mode: "predefined", dice_allow_edit: false });
  });

  it("la modification des lancers est coupée par défaut, et s'active", async () => {
    const user = utilisateur();
    render(<WorldDiceSettings world={monde({ dice_mode: "predefined" })} />);
    const option = screen.getByRole("switch", { name: "Permettre de modifier un lancer" });
    expect(option).toHaveAttribute("aria-checked", "false");
    await user.click(option);
    await attendre();
    expect(setWorldDiceRules).toHaveBeenCalledWith("w1", { dice_mode: "predefined", dice_allow_edit: true });
  });
});
