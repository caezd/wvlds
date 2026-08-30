import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorldHomeMarkdownBlockEditor } from "@/components/worlds/home/blocks/WorldHomeMarkdownBlockEditor";
import { MAX_HOME_BLOCK_CONTENT_LENGTH, MIN_HOME_BLOCK_HEIGHT } from "@/components/worlds/home/worldHomeGrid";

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

    expect(onSave).toHaveBeenCalledWith({ content: "Salut", title: "", card: false, height: undefined });
  });

  it("remonte le titre saisi avec le contenu", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeMarkdownBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Titre"), "Intro");
    await user.type(screen.getByLabelText("Markdown"), "Salut");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith({ content: "Salut", title: "Intro", card: false, height: undefined });
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

  it("la carte est désactivée par défaut, activable via le bouton — transmis à onSave", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeMarkdownBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    expect(screen.getByRole("switch")).not.toBeChecked();

    await user.click(screen.getByRole("switch"));
    await user.type(screen.getByLabelText("Markdown"), "Salut");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith({ content: "Salut", title: "", card: true, height: undefined });
  });

  it("pré-remplit l'état de la carte en édition", () => {
    render(
      <WorldHomeMarkdownBlockEditor
        open
        onOpenChange={vi.fn()}
        initialContent="Salut"
        initialCard
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("remonte la hauteur saisie, bornée", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeMarkdownBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Hauteur du bloc (px)"), "400");
    await user.type(screen.getByLabelText("Markdown"), "Salut");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ height: 400 }));

    await user.clear(screen.getByLabelText("Hauteur du bloc (px)"));
    await user.type(screen.getByLabelText("Hauteur du bloc (px)"), "5");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ height: MIN_HOME_BLOCK_HEIGHT }));
  });

  it("pré-remplit la hauteur existante en édition", () => {
    render(
      <WorldHomeMarkdownBlockEditor
        open
        onOpenChange={vi.fn()}
        initialContent="Salut"
        initialHeight={240}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Hauteur du bloc (px)")).toHaveValue(240);
  });

  // Même champ de saisie que le bloc HTML, pour ne pas avoir deux éditeurs
  // de code différents selon le type de bloc.
  it("le champ Markdown est un éditeur de code coloré", async () => {
    render(
      <WorldHomeMarkdownBlockEditor open onOpenChange={vi.fn()} initialContent="# Titre" onSave={vi.fn()} />,
    );

    await waitFor(() => expect(document.querySelector(".shiki")).toBeInTheDocument());
    expect(screen.getByLabelText("Markdown")).toHaveValue("# Titre");
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
