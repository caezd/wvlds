import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorldHomeMarkdownBlockEditor } from "@/components/worlds/home/blocks/WorldHomeMarkdownBlockEditor";
import { MAX_HOME_BLOCK_CONTENT_LENGTH } from "@/components/worlds/home/worldHomeGrid";

describe("WorldHomeMarkdownBlockEditor", () => {
  it("pré-remplit avec le contenu initial en édition", () => {
    render(
      <WorldHomeMarkdownBlockEditor open onOpenChange={vi.fn()} initialContent="# Titre" onSave={vi.fn()} />,
    );
    expect(screen.getByDisplayValue("# Titre")).toBeInTheDocument();
  });

  it("affiche un aperçu rendu du markdown saisi", async () => {
    const user = userEvent.setup();
    render(<WorldHomeMarkdownBlockEditor open onOpenChange={vi.fn()} onSave={vi.fn()} />);

    await user.type(screen.getByLabelText("Markdown"), "# Bonjour");

    expect(await screen.findByRole("heading", { name: "Bonjour" })).toBeInTheDocument();
  });

  it("le bouton Enregistrer est désactivé tant que le champ est vide", () => {
    render(<WorldHomeMarkdownBlockEditor open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("appelle onSave avec le markdown saisi", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeMarkdownBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Markdown"), "Salut");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith("Salut", "");
  });

  it("remonte le titre saisi avec le contenu", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeMarkdownBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Titre"), "Intro");
    await user.type(screen.getByLabelText("Markdown"), "Salut");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith("Salut", "Intro");
  });

  it("pré-remplit le titre existant en édition", () => {
    render(
      <WorldHomeMarkdownBlockEditor
        open
        onOpenChange={vi.fn()}
        initialContent="Salut"
        initialTitle="Intro"
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("Intro")).toBeInTheDocument();
  });

  it("désactive Enregistrer au-delà de la limite de caractères", () => {
    render(
      <WorldHomeMarkdownBlockEditor
        open
        onOpenChange={vi.fn()}
        initialContent={"a".repeat(MAX_HOME_BLOCK_CONTENT_LENGTH + 1)}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("le bouton Annuler ferme le panneau sans appeler onSave", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WorldHomeMarkdownBlockEditor open onOpenChange={onOpenChange} initialContent="x" onSave={onSave} />,
    );

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
  });
});
