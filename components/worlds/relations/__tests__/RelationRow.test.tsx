import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RelationRow } from "../RelationRow";
import type { CPersona, CRelation } from "../types";

// ──────────────────────────────────────────────────────────────────────────
// La description d'une relation s'ouvre en édition d'un clic. C'était un
// `<div onClick>` : impossible de renseigner une relation sans souris.
//
// C'est bien une commande — elle ouvre un champ de saisie — donc un bouton.
// Mais SEULEMENT quand l'édition est permise : sans le droit d'écrire, ce n'est
// que du texte, et l'annoncer comme un bouton promettrait une action qui
// n'arrivera pas. C'est ce couple que ces tests fixent.
// ──────────────────────────────────────────────────────────────────────────

const AUTRE: CPersona = {
  id: "p2",
  name: "Nyx",
  avatar_url: null,
  user_id: "u2",
};

function relation(description: string | null): CRelation {
  return {
    id: "r1",
    from_persona_id: "p1",
    to_persona_id: "p2",
    type: "ally",
    label: null,
    description,
  };
}

function rendre(canEdit: boolean, description: string | null, onUpdateDesc = vi.fn()) {
  render(
    <RelationRow
      rel={relation(description)}
      other={AUTRE}
      direction="→"
      canEdit={canEdit}
      onDelete={vi.fn()}
      onUpdateDesc={onUpdateDesc}
    />,
  );
  return onUpdateDesc;
}

describe("RelationRow — description", () => {
  it("est un bouton atteignable au clavier quand on peut la modifier", async () => {
    rendre(true, "Amis d'enfance");

    const bouton = screen.getByRole("button", { name: /Amis d'enfance/ });
    bouton.focus();
    expect(bouton).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    // Le champ de saisie prend la place du texte.
    expect(screen.getByRole("textbox")).toHaveValue("Amis d'enfance");
  });

  it("n'est PAS un bouton quand l'édition est interdite", () => {
    rendre(false, "Amis d'enfance");

    expect(screen.queryByRole("button", { name: /Amis d'enfance/ })).toBeNull();
    // Le texte reste lisible, il n'est simplement pas actionnable.
    expect(screen.getByText("Amis d'enfance")).toBeInTheDocument();
  });

  it("n'invite à écrire que ceux qui le peuvent", () => {
    // Une description vide affiche une invite « ajouter une description ».
    // La montrer à quelqu'un qui n'a pas le droit d'écrire serait trompeur.
    const { unmount } = render(
      <RelationRow rel={relation(null)} other={AUTRE} direction="→" canEdit
        onDelete={vi.fn()} onUpdateDesc={vi.fn()} />,
    );
    // Cibler l'invite elle-même : la ligne porte aussi un bouton de suppression.
    expect(screen.getByRole("button", { name: /ajouter une description/i })).toBeInTheDocument();
    unmount();

    rendre(false, null);
    expect(screen.queryByRole("button", { name: /ajouter une description/i })).toBeNull();
    expect(screen.queryByText(/ajouter une description/i)).toBeNull();
  });

  it("n'enregistre que si le texte a changé", async () => {
    // `onUpdateDesc` écrit en base : entrer puis sortir sans rien toucher ne
    // doit pas déclencher d'écriture.
    const onUpdateDesc = rendre(true, "Amis d'enfance");

    await userEvent.click(screen.getByRole("button", { name: /Amis d'enfance/ }));
    await userEvent.tab(); // provoque le `blur`, donc l'enregistrement
    expect(onUpdateDesc).not.toHaveBeenCalled();
  });

  it("enregistre le texte modifié", async () => {
    const onUpdateDesc = rendre(true, "Amis");

    await userEvent.click(screen.getByRole("button", { name: /Amis/ }));
    await userEvent.type(screen.getByRole("textbox"), " d'enfance");
    await userEvent.tab();

    expect(onUpdateDesc).toHaveBeenCalledWith("r1", "Amis d'enfance");
  });

  it("Échap abandonne la modification", async () => {
    const onUpdateDesc = rendre(true, "Amis");

    await userEvent.click(screen.getByRole("button", { name: /Amis/ }));
    await userEvent.type(screen.getByRole("textbox"), " et ennemis");
    await userEvent.keyboard("{Escape}");

    expect(onUpdateDesc).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Amis/ })).toBeInTheDocument();
  });
});
