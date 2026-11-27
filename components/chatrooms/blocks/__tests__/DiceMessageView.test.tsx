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
  mine = true,
} = {}) {
  render(
    <ChatroomDiceRulesProvider value={{ worldId: "w1", mode, allowEdit }}>
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
    expect(screen.getByText(/Critique/)).toBeInTheDocument();
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

  describe("faces en image (migration 272)", () => {
    const IMG = "https://x.supabase.co/storage/v1/object/public/worlds/world-1/dice/a.webp";

    it("une face tirée qui a une image la montre, avec son nombre", () => {
      afficher({ roll: { ...ROLL, results: [3], total: 3, faces: [{ value: 3, image: IMG }] } });
      const image = screen.getByRole("img", { name: "Face 3" });
      expect(image).toHaveAttribute("src", IMG);
      expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    });

    it("une face qui cache son nombre : ni nombre ni total, l'image seule", () => {
      afficher({
        roll: { ...ROLL, count: 2, results: [1, 3], total: 4, faces: [{ value: 3, image: IMG, hide_value: true }] },
      });
      expect(screen.getByRole("img", { name: "Face 3" })).toBeInTheDocument();
      // La face sans image garde son nombre ; le total, lui, trahirait la face cachée.
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.queryByText("4")).toBeNull();
      expect(screen.queryByText("3")).toBeNull();
      expect(screen.queryByText(/et obtenu/)).toBeNull();
    });

    it("sans image, rien ne change", () => {
      afficher();
      expect(screen.queryByRole("img")).toBeNull();
    });
  });
});
