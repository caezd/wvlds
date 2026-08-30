import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorldHomeHtmlBlockEditor } from "@/components/worlds/home/blocks/WorldHomeHtmlBlockEditor";
import {
  MAX_HOME_BLOCK_CONTENT_LENGTH,
  MAX_HOME_BLOCK_HEIGHT,
  MIN_HOME_BLOCK_HEIGHT,
} from "@/components/worlds/home/worldHomeGrid";

describe("WorldHomeHtmlBlockEditor", () => {
  it("pré-remplit avec le HTML initial en édition", () => {
    render(
      <WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} initialHtml="<p>x</p>" onSave={vi.fn()} />,
    );
    expect(screen.getByDisplayValue("<p>x</p>")).toBeInTheDocument();
  });

  it("affiche un aperçu sandboxé du HTML saisi", async () => {
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={vi.fn()} />);

    await user.type(screen.getByLabelText("HTML / CSS"), "<p>Salut</p>");

    const iframe = document.querySelector("iframe")!;
    expect(iframe).toHaveAttribute("sandbox", "");
    expect(iframe).toHaveAttribute("srcdoc", "<p>Salut</p>");
  });

  it("le bouton Enregistrer est désactivé tant que le champ est vide", () => {
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("appelle onSave avec le HTML saisi", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("HTML / CSS"), "<p>x</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith({ html: "<p>x</p>", title: "", card: true, height: undefined });
  });

  it("remonte le titre saisi avec le contenu", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Titre"), "Bandeau d'accueil");
    await user.type(screen.getByLabelText("HTML / CSS"), "<p>x</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith({
      html: "<p>x</p>",
      title: "Bandeau d'accueil",
      card: true,
      height: undefined,
    });
  });

  it("pré-remplit le titre existant en édition", () => {
    render(
      <WorldHomeHtmlBlockEditor
        open
        onOpenChange={vi.fn()}
        initialHtml="<p>x</p>"
        initialTitle="Bandeau"
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("Bandeau")).toBeInTheDocument();
  });

  it("désactive Enregistrer et affiche l'erreur au-delà de la limite de caractères", async () => {
    const onSave = vi.fn();
    render(
      <WorldHomeHtmlBlockEditor
        open
        onOpenChange={vi.fn()}
        initialHtml={"a".repeat(MAX_HOME_BLOCK_CONTENT_LENGTH + 1)}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    expect(screen.getByText(`Maximum ${MAX_HOME_BLOCK_CONTENT_LENGTH} caractères.`)).toBeInTheDocument();
  });

  it("la carte est activée par défaut, désactivable via le bouton — transmis à onSave", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    expect(screen.getByRole("switch")).toBeChecked();

    await user.click(screen.getByRole("switch"));
    await user.type(screen.getByLabelText("HTML / CSS"), "<p>x</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith({ html: "<p>x</p>", title: "", card: false, height: undefined });
  });

  it("pré-remplit l'état de la carte en édition", () => {
    render(
      <WorldHomeHtmlBlockEditor
        open
        onOpenChange={vi.fn()}
        initialHtml="<p>x</p>"
        initialCard={false}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("remonte la hauteur saisie", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Hauteur du bloc (px)"), "320");
    await user.type(screen.getByLabelText("HTML / CSS"), "<p>x</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ height: 320 }));
  });

  // Le champ borne à la saisie plutôt qu'au seul enregistrement : l'admin voit
  // tout de suite la hauteur réellement retenue, au lieu de la découvrir après
  // coup (même assainissement partagé que la grille et le serveur).
  it("borne une hauteur hors limites", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Hauteur du bloc (px)"), "5");
    await user.type(screen.getByLabelText("HTML / CSS"), "<p>x</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ height: MIN_HOME_BLOCK_HEIGHT }));
  });

  it("vider le champ hauteur revient à « automatique »", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} initialHtml="<p>x</p>" initialHeight={320} onSave={onSave} />,
    );

    await user.clear(screen.getByLabelText("Hauteur du bloc (px)"));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ height: undefined }));
  });

  it("pré-remplit la hauteur existante en édition, et borne le champ", () => {
    render(
      <WorldHomeHtmlBlockEditor
        open
        onOpenChange={vi.fn()}
        initialHtml="<p>x</p>"
        initialHeight={320}
        onSave={vi.fn()}
      />,
    );
    const champ = screen.getByLabelText("Hauteur du bloc (px)");
    expect(champ).toHaveValue(320);
    expect(champ).toHaveAttribute("min", String(MIN_HOME_BLOCK_HEIGHT));
    expect(champ).toHaveAttribute("max", String(MAX_HOME_BLOCK_HEIGHT));
  });

  it("le bouton Annuler ferme le panneau sans appeler onSave", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WorldHomeHtmlBlockEditor open onOpenChange={onOpenChange} initialHtml="<p>x</p>" onSave={onSave} />,
    );

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
  });
});
