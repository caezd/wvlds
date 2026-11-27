import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DiceMessageView } from "@/components/chatrooms/blocks/DiceMessageView";
import { ChatroomDiceRulesProvider } from "@/components/chatrooms/blocks/chatroomDiceRules";
import type { DiceBlock } from "@/lib/chat-blocks";
import type { DiceMode, DiceRoll } from "@/lib/worldDice";

const ROLL: DiceRoll = {
  id: "r1", die_name: "Dé de peur", min_value: 0, max_value: 5, count: 1, modifier: 0, results: [3], total: 3,
};
// Le texte du message peut mentir : l'affichage lit le lancer de la base.
const BLOCK: DiceBlock = { _type: "dice", roll_id: "r1", formula: "1d20", results: [20], modifier: 0, total: 20, label: "Courage" };

function afficher({
  block = BLOCK,
  roll = ROLL as DiceRoll | null,
  mode = "free" as DiceMode,
  allowEdit = false,
  critical = true,
  fumble = true,
  mine = true,
} = {}) {
  render(
    <ChatroomDiceRulesProvider value={{ worldId: "w1", mode, allowEdit, critical, fumble }}>
      <DiceMessageView block={block} roll={roll} label="Hyun" mine={mine} onEditLabel={vi.fn()} onDelete={vi.fn()} />
    </ChatroomDiceRulesProvider>,
  );
}

describe("DiceMessageView", () => {
  it("affiche le lancer tiré par la base, pas le texte du message", () => {
    afficher();
    expect(screen.getByText("Dé de peur")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("20")).toBeNull();
    expect(screen.getByText(/Courage/)).toBeInTheDocument();
  });

  it("le critique suit la plage du dé", () => {
    afficher({ roll: { ...ROLL, results: [5], total: 5 } });
    expect(screen.getByText("Critique !")).toBeInTheDocument();
  });

  it("sans les options du monde, ni critique ni échec critique", () => {
    afficher({ roll: { ...ROLL, results: [5], total: 5 }, critical: false, fumble: false });
    expect(screen.queryByText("Critique !")).toBeNull();
    afficher({ roll: { ...ROLL, results: [0], total: 0 }, critical: false, fumble: false });
    expect(screen.queryByText("Échec critique")).toBeNull();
  });

  it("un ancien lancer, sans lancer de la base, s'affiche comme avant dans un monde libre", () => {
    afficher({ block: { ...BLOCK, roll_id: undefined }, roll: null });
    expect(screen.getByText("1d20")).toBeInTheDocument();
    expect(screen.queryByText("Non vérifié")).toBeNull();
  });

  it("dans un monde aux dés prédéfinis, un lancer sans lancer de la base est marqué non vérifié", () => {
    afficher({ block: { ...BLOCK, roll_id: undefined }, roll: null, mode: "predefined" });
    expect(screen.getByText("Non vérifié")).toBeInTheDocument();
  });

  it("un lancer ne se modifie pas, sauf si le monde le permet", () => {
    afficher();
    expect(screen.queryByRole("button", { name: "Modifier la description" })).toBeNull();
    // La suppression reste.
    expect(screen.getByRole("button", { name: "Supprimer le bloc" })).toBeInTheDocument();
  });

  it("le monde permet la modification : l'auteur change la description", () => {
    afficher({ allowEdit: true });
    expect(screen.getByRole("button", { name: "Modifier la description" })).toBeInTheDocument();
  });

  describe("la carte du lancer", () => {
    it("un seul dé sans modificateur : le résultat une fois, sans total répété", () => {
      afficher();
      expect(screen.getAllByText("3")).toHaveLength(1);
      expect(screen.queryByText(/=/)).toBeNull();
    });

    it("plusieurs dés et un modificateur : chaque dé, le modificateur, puis le total", () => {
      afficher({ roll: { ...ROLL, count: 2, results: [2, 5], modifier: 1, total: 8 } });
      const resultat = screen.getByTestId("dice-roll-result");
      expect(resultat).toHaveTextContent(/2\s*5\s*\+1\s*8/);
    });

    it("la description devient le titre ; qui a lancé et le dé, en dessous", () => {
      afficher();
      expect(screen.getByTestId("dice-roll-title")).toHaveTextContent("Courage");
      const sous = screen.getByTestId("dice-roll-meta");
      expect(sous).toHaveTextContent("Hyun");
      expect(sous).toHaveTextContent("Dé de peur");
    });

    it("sans description, le titre est le dé lancé", () => {
      afficher({ block: { ...BLOCK, label: undefined } });
      expect(screen.getByTestId("dice-roll-title")).toHaveTextContent("Dé de peur");
      expect(screen.getByTestId("dice-roll-meta")).toHaveTextContent("Hyun");
      expect(screen.getByTestId("dice-roll-meta")).not.toHaveTextContent("Dé de peur");
    });

    it("un critique se signale par un badge ; un échec critique aussi", () => {
      const D6 = { ...ROLL, die_name: "d6", min_value: 1, max_value: 6 };
      afficher({ roll: { ...D6, results: [6], total: 6 } });
      expect(screen.getByText("Critique !")).toHaveAttribute("data-tone", "success");
      afficher({ roll: { ...D6, results: [1], total: 1 } });
      expect(screen.getByText("Échec critique")).toHaveAttribute("data-tone", "danger");
    });
  });

  describe("faces en image (migration 272)", () => {
    const IMG = "https://x.supabase.co/storage/v1/object/public/worlds/world-1/dice/a.webp";

    it("une face tirée qui a une image la montre seule, sans son nombre", () => {
      afficher({ roll: { ...ROLL, results: [3], total: 3, faces: [{ value: 3, image: IMG }] } });
      const image = screen.getByRole("img", { name: "Face 3" });
      expect(image).toHaveAttribute("src", IMG);
      expect(screen.getByTestId("dice-roll-result")).toHaveTextContent(/^$/);
    });

    it("un lancer qui tire une face en image : ni total ni modificateur", () => {
      afficher({
        roll: { ...ROLL, count: 2, modifier: 1, results: [1, 3], total: 5, faces: [{ value: 3, image: IMG }] },
      });
      expect(screen.getByRole("img", { name: "Face 3" })).toBeInTheDocument();
      // La face sans image garde son nombre ; rien d'autre ne s'additionne.
      expect(screen.getByTestId("dice-roll-result")).toHaveTextContent(/^1$/);
    });

    it("sans image, rien ne change", () => {
      afficher();
      expect(screen.queryByRole("img")).toBeNull();
    });
  });
});
