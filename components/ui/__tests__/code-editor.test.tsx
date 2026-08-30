import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CodeEditor } from "@/components/ui/code-editor";

describe("CodeEditor", () => {
  // La coloration arrive après un chargement asynchrone : d'ici là, le code
  // doit rester lisible plutôt que de disparaître.
  it("affiche le code avant même que la coloration soit chargée", () => {
    const { container } = render(<CodeEditor value="<p>Salut</p>" onChange={vi.fn()} language="html" />);
    // Le texte est présent deux fois par construction — dans la couche
    // colorée et dans la zone de saisie transparente posée par-dessus.
    expect(container.querySelector("pre")).toHaveTextContent("<p>Salut</p>");
    expect(screen.getByRole("textbox")).toHaveValue("<p>Salut</p>");
  });

  it("remonte la saisie", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CodeEditor id="champ" value="" onChange={onChange} language="css" />);

    await user.type(screen.getByRole("textbox"), "a");

    expect(onChange).toHaveBeenCalledWith("a");
  });

  // Le thème de Shiki n'émet aucune couleur figée : il ne pose que des
  // variables CSS, définies par la palette de l'application (les `--shiki-*`
  // de globals.css). C'est ce qui fait suivre la coloration au thème
  // clair/sombre sans recolorer quoi que ce soit en JavaScript.
  it("colore le code avec les variables CSS de la palette, sans couleur figée", async () => {
    render(<CodeEditor value="<p>Salut</p>" onChange={vi.fn()} language="html" />);

    await waitFor(() => expect(document.querySelector(".shiki")).toBeInTheDocument());

    const coloré = document.querySelector(".shiki")!.outerHTML;
    expect(coloré).toContain("var(--shiki-");
    expect(coloré).not.toMatch(/color\s*:\s*#[0-9a-f]{3,8}/i);
  });
});
