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

  it("colore le code", async () => {
    render(<CodeEditor value="<p>Salut</p>" onChange={vi.fn()} language="html" />);

    await waitFor(() => expect(document.querySelector(".shiki")).toBeInTheDocument());

    // Des couleurs de texte sont bien posées, sur des fragments distincts.
    expect(document.querySelectorAll(".shiki span[style*='color']").length).toBeGreaterThan(1);
  });

  // Le fond du thème est neutralisé à la génération (voir highlightCode) : le
  // champ laisse voir celui du tiroir au lieu d'y découper un rectangle
  // opaque.
  it("ne peint aucun fond opaque par-dessus celui du tiroir", async () => {
    render(<CodeEditor value="<p>Salut</p>" onChange={vi.fn()} language="html" />);

    await waitFor(() => expect(document.querySelector(".shiki")).toBeInTheDocument());

    const pre = document.querySelector(".shiki") as HTMLElement;
    expect(pre.style.backgroundColor).toBe("transparent");
  });
});

describe("CodeEditor — hauteur qui suit le texte", () => {
  it("porte le texte dans une couche en flux, qui donne la hauteur", () => {
    const { container } = render(
      <CodeEditor autoGrow value={"un\ndeux"} onChange={vi.fn()} language="markdown" />,
    );

    // Trois couches : la règle en flux, et les deux superposées.
    const regle = container.querySelector("pre.static");
    expect(regle).not.toBeNull();
    expect(getComputedStyle(regle!).position).not.toBe("absolute");
  });

  it("ajoute le saut de ligne final que le navigateur avale", () => {
    // Sans lui, un texte qui s'achève par une ligne vide donnerait une boîte
    // trop courte d'une ligne, et la dernière ligne saisie passerait sous le
    // bord.
    const { container } = render(
      <CodeEditor autoGrow value={"une ligne"} onChange={vi.fn()} language="markdown" />,
    );

    expect(container.querySelector("pre.static")!.textContent).toBe("une ligne\n");
  });

  it("ne fixe aucune hauteur au conteneur", () => {
    const { container } = render(
      <CodeEditor autoGrow rows={12} value="x" onChange={vi.fn()} language="markdown" />,
    );

    // `rows` ne s'applique plus : c'est le texte qui commande.
    expect((container.firstChild as HTMLElement).style.height).toBe("");
  });
});
