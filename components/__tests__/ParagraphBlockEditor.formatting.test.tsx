import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";

// HsvColorPicker dessine sur un <canvas> — jsdom n'implémente pas
// getContext("2d") sans le paquet natif "canvas". On le remplace ici : seule
// l'ouverture du popover et le câblage du bouton "Confirmer" sont testés.
vi.mock("@/components/ui/hsv-color-picker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/hsv-color-picker")>();
  return { ...actual, HsvColorPicker: () => <div data-testid="hsv-color-picker-stub" /> };
});

import { ParagraphBlockEditor } from "@/components/chatrooms/ParagraphBlockEditor";

function getEditor(container: HTMLElement) {
  const el = container.querySelector("[contenteditable]");
  if (!el) throw new Error("editor introuvable");
  return el as HTMLElement;
}

/** Sélectionne `text[start:end]` dans le nœud texte du premier bloc de l'éditeur. */
function selectRange(editor: HTMLElement, start: number, end: number) {
  const block = editor.querySelector("[data-block]")!;
  const textNode = block.firstChild as Text;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

describe("ParagraphBlockEditor — barre de mise en forme", () => {
  // jsdom n'implémente pas HTMLElement.innerText (seulement textContent) —
  // approximation suffisante pour ces tests (contenu sur une seule ligne,
  // sans <br>, où textContent et innerText coïncident).
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get() { return this.textContent; },
    });
  });
  afterAll(() => {
    // @ts-expect-error -- retire le polyfill ajouté pour le test
    delete HTMLElement.prototype.innerText;
  });

  // jsdom ne définit pas document.execCommand du tout (pas même en no-op) —
  // on l'assigne nous-mêmes plutôt que vi.spyOn, qui exige que la propriété
  // existe déjà sur l'objet.
  let execCommandSpy: ReturnType<typeof vi.fn<typeof document.execCommand>>;

  beforeEach(() => {
    execCommandSpy = vi.fn<typeof document.execCommand>().mockReturnValue(true);
    document.execCommand = execCommandSpy;
  });

  afterEach(() => {
    // @ts-expect-error -- retire le stub ajouté pour le test
    delete document.execCommand;
  });

  it("n'affiche pas la barre par défaut (formatting non activé)", () => {
    const { container } = render(<ParagraphBlockEditor value="" onChange={() => {}} />);
    fireEvent.focus(getEditor(container));
    expect(screen.queryByTitle("Gras")).toBeNull();
  });

  it("n'affiche pas la barre tant que l'éditeur n'est pas focus", () => {
    render(<ParagraphBlockEditor value="" onChange={() => {}} formatting />);
    expect(screen.queryByTitle("Gras")).toBeNull();
  });

  it("affiche la barre quand formatting est activé et l'éditeur est focus", () => {
    const { container } = render(<ParagraphBlockEditor value="" onChange={() => {}} formatting />);
    fireEvent.focus(getEditor(container));
    expect(screen.getByTitle("Gras")).toBeInTheDocument();
    expect(screen.getByTitle("Italique")).toBeInTheDocument();
    expect(screen.getByTitle("Barré")).toBeInTheDocument();
    expect(screen.getByTitle("Souligné")).toBeInTheDocument();
    expect(screen.getByTitle("Lien")).toBeInTheDocument();
    expect(screen.getByTitle("Liste")).toBeInTheDocument();
    expect(screen.getByTitle("Couleur du texte")).toBeInTheDocument();
  });

  it("masque la barre à nouveau quand l'éditeur perd le focus", () => {
    const { container } = render(<ParagraphBlockEditor value="" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    expect(screen.getByTitle("Gras")).toBeInTheDocument();
    fireEvent.blur(editor);
    expect(screen.queryByTitle("Gras")).toBeNull();
  });

  it("Gras avec une sélection entoure le texte sélectionné de **", () => {
    const { container } = render(<ParagraphBlockEditor value="bonjour" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 7);
    fireEvent.mouseDown(screen.getByTitle("Gras"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "**bonjour**");
  });

  it("Italique sans sélection insère une paire de marqueurs vide", () => {
    const { container } = render(<ParagraphBlockEditor value="bonjour" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 3, 3);
    fireEvent.mouseDown(screen.getByTitle("Italique"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "**");
  });

  it("Barré entoure la sélection de ~~", () => {
    const { container } = render(<ParagraphBlockEditor value="oups" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 4);
    fireEvent.mouseDown(screen.getByTitle("Barré"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "~~oups~~");
  });

  it("Souligné utilise le marqueur {u}…{/}", () => {
    const { container } = render(<ParagraphBlockEditor value="important" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 9);
    fireEvent.mouseDown(screen.getByTitle("Souligné"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "{u}important{/}");
  });

  it("Lien entoure la sélection en syntaxe markdown [texte](https://)", () => {
    const { container } = render(<ParagraphBlockEditor value="ici" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 3);
    fireEvent.mouseDown(screen.getByTitle("Lien"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "[ici](https://)");
  });

  it("Liste préfixe le bloc courant par \"- \"", () => {
    const { container } = render(<ParagraphBlockEditor value="une ligne" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 0);
    fireEvent.mouseDown(screen.getByTitle("Liste"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "- une ligne");
  });

  it("ouvre le popover de couleur au clic sur le bouton palette", () => {
    const { container } = render(<ParagraphBlockEditor value="rouge" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 5);
    fireEvent.mouseDown(screen.getByTitle("Couleur du texte"));
    expect(screen.getByText("Confirmer")).toBeInTheDocument();
  });
});
