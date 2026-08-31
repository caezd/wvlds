import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Seul `preloadCodeHighlighter` est remplacé : la coloration elle-même reste
// la vraie, c'est elle que les autres tests de ce fichier observent.
const préchargement = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock("@/lib/codeHighlighter", async (original) => ({
  ...(await original<typeof import("@/lib/codeHighlighter")>()),
  preloadCodeHighlighter: préchargement,
}));

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

  // L'aperçu se cible par la classe de scope du bloc : depuis que le champ de
  // saisie est coloré, le même texte apparaît aussi, découpé en fragments,
  // dans la couche de coloration.
  it("affiche un aperçu du HTML saisi, tel qu'il sera réellement rendu", async () => {
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "HTML" }), "<p>Salut</p>");

    await waitFor(() => expect(document.querySelector(".wvlds-hb-preview")).toBeInTheDocument());
    expect(document.querySelector(".wvlds-hb-preview")).toHaveTextContent("Salut");
    expect(document.querySelector("iframe")).toBeNull();
  });

  // L'aperçu emploie le composant de rendu public : ce que l'admin y voit
  // disparaître est exactement ce qui ne sera pas affiché aux membres.
  it("l'aperçu montre le balisage assaini, pas la saisie brute", async () => {
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={vi.fn()} />);

    await user.type(
      screen.getByRole("textbox", { name: "HTML" }),
      "<p>Salut</p><script>alert(1)</script>",
    );

    await waitFor(() => expect(document.querySelector(".wvlds-hb-preview")).toBeInTheDocument());
    expect(document.querySelector(".wvlds-hb-preview")).toHaveTextContent("Salut");
    expect(document.querySelector("script")).toBeNull();
  });

  it("le CSS a son propre onglet, remonté séparément du balisage", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByRole("textbox", { name: "HTML" }), "<p>x</p>");
    await user.click(screen.getByRole("tab", { name: "CSS" }));
    await user.type(screen.getByRole("textbox", { name: "CSS" }), ":scope {{ color: red; }");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ html: "<p>x</p>", css: ":scope { color: red; }" }),
    );
  });

  // Régression : ces exemples ont d'abord été des messages traduits, mais les
  // accolades sont des caractères spéciaux d'ICU — next-intl échouait à
  // analyser le message et affichait le chemin de la clé à la place du texte
  // (bug rapporté par l'utilisateur). Ils vivent désormais dans le composant.
  // Radix ne monte le contenu d'un onglet qu'une fois celui-ci sélectionné :
  // sans ce préchargement, la grammaire CSS ne partirait qu'au clic sur son
  // onglet, avec l'attente que ça suppose.
  it("demande la grammaire CSS dès l'ouverture, sans attendre le clic sur son onglet", () => {
    préchargement.mockClear();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={vi.fn()} />);

    expect(préchargement).toHaveBeenCalledWith("css");
  });

  it("affiche des exemples de code lisibles dans les champs vides", async () => {
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "HTML" })).toHaveAttribute(
      "placeholder",
      '<div class="bloc">…</div>',
    );

    await user.click(screen.getByRole("tab", { name: "CSS" }));
    expect(screen.getByRole("textbox", { name: "CSS" })).toHaveAttribute(
      "placeholder",
      ":scope { padding: 1rem; }",
    );
  });

  it("pré-remplit le CSS existant en édition", async () => {
    const user = userEvent.setup();
    render(
      <WorldHomeHtmlBlockEditor
        open
        onOpenChange={vi.fn()}
        initialHtml="<p>x</p>"
        initialCss=":scope { color: red; }"
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "CSS" }));
    expect(screen.getByRole("textbox", { name: "CSS" })).toHaveValue(":scope { color: red; }");
  });

  it("le bouton Enregistrer est désactivé tant que le champ est vide", () => {
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("appelle onSave avec le HTML saisi", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByRole("textbox", { name: "HTML" }), "<p>x</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith({ html: "<p>x</p>", css: "", title: "", card: true, height: undefined });
  });

  it("remonte le titre saisi avec le contenu", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<WorldHomeHtmlBlockEditor open onOpenChange={vi.fn()} onSave={onSave} />);

    await user.type(screen.getByLabelText("Titre"), "Bandeau d'accueil");
    await user.type(screen.getByRole("textbox", { name: "HTML" }), "<p>x</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith({
      html: "<p>x</p>",
      css: "",
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
    await user.type(screen.getByRole("textbox", { name: "HTML" }), "<p>x</p>");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledWith({ html: "<p>x</p>", css: "", title: "", card: false, height: undefined });
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
    await user.type(screen.getByRole("textbox", { name: "HTML" }), "<p>x</p>");
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
    await user.type(screen.getByRole("textbox", { name: "HTML" }), "<p>x</p>");
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
