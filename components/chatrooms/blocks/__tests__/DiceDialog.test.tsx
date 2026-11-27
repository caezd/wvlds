import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listWorldDice = vi.fn();
vi.mock("@/app/actions/worldDice", () => ({
  listWorldDice: (...a: unknown[]) => listWorldDice(...a),
}));

import { DiceDialog } from "@/components/chatrooms/blocks/DiceDialog";
import { ChatroomDiceRulesProvider } from "@/components/chatrooms/blocks/chatroomDiceRules";
import type { DiceMode, WorldDie } from "@/lib/worldDice";

const D6: WorldDie = { id: "d6", world_id: "w1", name: "d6", min_value: 1, max_value: 6, hidden: false, position: 0, faces: [] };
const PEUR: WorldDie = { id: "peur", world_id: "w1", name: "Dé de peur", min_value: 0, max_value: 5, hidden: true, position: 1, faces: [] };

function ouvrir(mode: DiceMode = "free") {
  const onRoll = vi.fn();
  render(
    <ChatroomDiceRulesProvider value={{ worldId: "w1", mode, allowEdit: false }}>
      <DiceDialog open onOpenChange={() => {}} onRoll={onRoll} />
    </ChatroomDiceRulesProvider>,
  );
  return onRoll;
}

beforeEach(() => {
  vi.clearAllMocks();
  listWorldDice.mockResolvedValue({ ok: true, dice: [D6, PEUR] });
});

describe("DiceDialog — sans dé dans le monde", () => {
  beforeEach(() => listWorldDice.mockResolvedValue({ ok: true, dice: [] }));

  it("reste la fenêtre d'une formule libre, avec ses raccourcis", async () => {
    const user = userEvent.setup();
    const onRoll = ouvrir();
    const formule = await screen.findByRole("textbox", { name: "Formule" });
    expect(formule).toHaveValue("1d20");
    await user.click(screen.getByRole("button", { name: "2d6" }));
    expect(formule).toHaveValue("2d6");
    await user.type(screen.getByRole("textbox", { name: "Étiquette (optionnel)" }), " Attaque ");
    await user.click(screen.getByRole("button", { name: "Lancer" }));
    expect(onRoll).toHaveBeenCalledWith({ faces: 6, count: 2, modifier: 0, label: "Attaque" });
  });

  it("une formule invalide ne part pas", async () => {
    const user = userEvent.setup();
    const onRoll = ouvrir();
    const formule = await screen.findByRole("textbox", { name: "Formule" });
    await user.clear(formule);
    await user.type(formule, "abc");
    await user.click(screen.getByRole("button", { name: "Lancer" }));
    expect(onRoll).not.toHaveBeenCalled();
    expect(screen.getByText(/Formule invalide/)).toBeInTheDocument();
  });

  it("en mode dés du monde seulement, le dit et ne lance rien", async () => {
    ouvrir("predefined");
    expect(await screen.findByText("Aucun dé n'est encore défini dans ce monde.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Formule" })).toBeNull();
    expect(screen.getByRole("button", { name: "Lancer" })).toBeDisabled();
  });
});

describe("DiceDialog — avec les dés du monde", () => {
  it("les dés du monde remplacent les raccourcis ; on les choisit ici", async () => {
    const user = userEvent.setup();
    const onRoll = ouvrir();
    const des = await screen.findByRole("radiogroup", { name: "Dé" });
    expect(within(des).getByRole("radio", { name: "Formule libre" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "2d6" })).toBeNull();
    // Un dé masqué n'est rendu qu'à l'équipe ; il le dit.
    expect(within(des).getByRole("radio", { name: "Dé de peur (masqué)" })).toBeInTheDocument();

    await user.click(within(des).getByRole("radio", { name: "d6" }));
    expect(screen.queryByRole("textbox", { name: "Formule" })).toBeNull();
    const nombre = screen.getByRole("spinbutton", { name: "Nombre de dés" });
    await user.clear(nombre);
    await user.type(nombre, "3");
    const modificateur = screen.getByRole("spinbutton", { name: "Modificateur" });
    await user.clear(modificateur);
    await user.type(modificateur, "-2");
    await user.click(screen.getByRole("button", { name: "Lancer" }));
    expect(onRoll).toHaveBeenCalledWith({ dieId: "d6", count: 3, modifier: -2, label: undefined });
  });

  it("revenir à la formule libre", async () => {
    const user = userEvent.setup();
    const onRoll = ouvrir();
    const des = await screen.findByRole("radiogroup", { name: "Dé" });
    await user.click(within(des).getByRole("radio", { name: "d6" }));
    await user.click(within(des).getByRole("radio", { name: "Formule libre" }));
    const formule = screen.getByRole("textbox", { name: "Formule" });
    await user.clear(formule);
    await user.type(formule, "1d8+1");
    await user.click(screen.getByRole("button", { name: "Lancer" }));
    expect(onRoll).toHaveBeenCalledWith({ faces: 8, count: 1, modifier: 1, label: undefined });
  });

  it("en mode dés du monde seulement : pas de formule, le premier dé choisi", async () => {
    const user = userEvent.setup();
    const onRoll = ouvrir("predefined");
    const des = await screen.findByRole("radiogroup", { name: "Dé" });
    expect(within(des).queryByRole("radio", { name: "Formule libre" })).toBeNull();
    expect(within(des).getByRole("radio", { name: "d6" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("textbox", { name: "Formule" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Lancer" }));
    expect(onRoll).toHaveBeenCalledWith({ dieId: "d6", count: 1, modifier: 0, label: undefined });
  });

  it("un nombre de dés hors bornes ne part pas", async () => {
    const user = userEvent.setup();
    const onRoll = ouvrir("predefined");
    const nombre = await screen.findByRole("spinbutton", { name: "Nombre de dés" });
    await user.clear(nombre);
    await user.type(nombre, "0");
    await user.click(screen.getByRole("button", { name: "Lancer" }));
    expect(onRoll).not.toHaveBeenCalled();
    expect(screen.getByText("De 1 à 100 dés.")).toBeInTheDocument();
  });
});
