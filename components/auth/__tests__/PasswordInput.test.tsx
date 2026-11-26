import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/PasswordInput";

function Champ() {
  return (
    <>
      <Label htmlFor="password">Mot de passe</Label>
      <PasswordInput id="password" defaultValue="secret1" />
    </>
  );
}

describe("PasswordInput : l'œil qui affiche ou masque le mot de passe", () => {
  it("masqué d'abord ; l'œil l'affiche, puis le masque à nouveau", async () => {
    const user = userEvent.setup();
    render(<Champ />);
    const champ = screen.getByLabelText("Mot de passe");
    expect(champ).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(champ).toHaveAttribute("type", "text");
    expect(champ).toHaveValue("secret1");

    await user.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(champ).toHaveAttribute("type", "password");
  });

  it("l'œil n'envoie pas le formulaire", async () => {
    const user = userEvent.setup();
    let envoye = false;
    render(
      <form onSubmit={(e) => { e.preventDefault(); envoye = true; }}>
        <Champ />
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(envoye).toBe(false);
  });
});
