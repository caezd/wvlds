import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Les deux sélecteurs sont remplacés par leur déclencheur, qui choisit une
// icône fixe au clic : c'est l'aiguillage entre les deux sources qu'on teste,
// pas les sélecteurs eux-mêmes.
vi.mock("@/components/personas/RpgIconPicker", () => ({
  RpgIconPicker: ({ onChange, trigger }: { onChange: (v: string) => void; trigger: React.ReactElement }) => (
    <span onClick={() => onChange("sword.svg")}>{trigger}</span>
  ),
}));
vi.mock("@/components/ui/LucideIconPicker", () => ({
  LucideIconPicker: ({ onChange, trigger }: { onChange: (v: string) => void; trigger: React.ReactElement }) => (
    <span onClick={() => onChange("heart")}>{trigger}</span>
  ),
}));

import { AddForm } from "@/components/worlds/catalogue/CataloguePieces";

describe("AddForm — saisie rapide", () => {
  it.each(["inventory", "skills"] as const)("offre les icônes de jeu ET de l'application (%s)", (type) => {
    render(<AddForm type={type} categoryId={null} onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Choisir une icône de jeu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choisir une icône de l’application" })).toBeInTheDocument();
  });

  it("choisir une source efface l'autre, et le choix part avec l'objet", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<AddForm type="skills" categoryId="cat1" onAdd={onAdd} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Choisir une icône de l’application" }));
    await user.click(screen.getByRole("button", { name: "Choisir une icône de jeu" }));
    await user.type(screen.getByPlaceholderText("Nom de la compétence"), "Forge");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      name: "Forge", icon: "sword.svg", lucide_icon: null, category_id: "cat1",
    }));
  });
});
