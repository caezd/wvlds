import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";

// HsvColorPicker dessine sur un <canvas> — jsdom n'implémente pas
// getContext("2d") sans le paquet natif "canvas". On le remplace ici : seule
// l'ouverture du popover et le câblage du bouton "Confirmer" sont testés.
vi.mock("@/components/ui/hsv-color-picker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/hsv-color-picker")>();
  return { ...actual, HsvColorPicker: () => <div data-testid="hsv-color-picker-stub" /> };
});

import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";

function getEditor(container: HTMLElement) {
  const el = container.querySelector("[contenteditable]");
  if (!el) throw new Error("editor introuvable");
  return el as HTMLElement;
}

/**
 * Sélectionne `text[start:end]` dans le nœud texte du premier bloc de
 * l'éditeur, puis déclenche mouseup — la barre flottante n'apparaît que sur
 * ce même événement (ou selectionchange, que jsdom ne déclenche pas
 * automatiquement sur un `Selection.addRange()` programmatique).
 */
function selectRange(editor: HTMLElement, start: number, end: number) {
  const block = editor.querySelector("[data-block]")!;
  const textNode = block.firstChild as Text;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(editor);
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
    const { container } = render(<ParagraphBlockEditor value="bonjour" onChange={() => {}} />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 7);
    expect(screen.queryByTitle("Gras")).toBeNull();
  });

  it("le focus seul (sans sélection) n'affiche pas la barre", () => {
    const { container } = render(<ParagraphBlockEditor value="bonjour" onChange={() => {}} formatting />);
    fireEvent.focus(getEditor(container));
    expect(screen.queryByTitle("Gras")).toBeNull();
  });

  it("affiche la barre quand du texte est sélectionné", () => {
    const { container } = render(<ParagraphBlockEditor value="bonjour" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 7);
    expect(screen.getByTitle("Gras")).toBeInTheDocument();
    expect(screen.getByTitle("Italique")).toBeInTheDocument();
    expect(screen.getByTitle("Barré")).toBeInTheDocument();
    expect(screen.getByTitle("Souligné")).toBeInTheDocument();
    expect(screen.getByTitle("Titre")).toBeInTheDocument();
    expect(screen.getByTitle("Liste")).toBeInTheDocument();
    expect(screen.getByTitle("Couleur du texte")).toBeInTheDocument();
  });

  it("normalise une espace insécable en espace normale (sinon un titre ## n'est pas reconnu par remark)", () => {
    // Le navigateur substitue parfois une espace insécable (U+00A0) à une
    // espace normale en bord de contenu — notamment juste après "## " inséré
    // via execCommand("insertHTML", …) par le bouton Titre. CommonMark exige
    // une espace ASCII stricte après les # d'un titre ATX : sans
    // normalisation, "## titre" reste un paragraphe littéral au rendu.
    const onChange = vi.fn();
    const { container } = render(<ParagraphBlockEditor value="" onChange={onChange} formatting />);
    const editor = getEditor(container);
    const block = editor.querySelector("[data-block]")!;
    block.textContent = "## titre";
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalledWith("## titre");
  });

  it("recalcule la position de la barre après un scroll, pas seulement au changement de sélection", () => {
    // jsdom n'implémente pas Range.getBoundingClientRect nativement (voir le
    // fallback dans le composant) — on le stub ici pour vérifier qu'un
    // scroll (qui ne déclenche pas "selectionchange") redéclenche bien le
    // recalcul, plutôt que de laisser la barre ancrée à sa position d'avant
    // scroll pendant que le texte sélectionné défile sous elle.
    let rectTop = 100;
    const getBoundingClientRectSpy = vi.fn(() => ({
      top: rectTop, bottom: rectTop + 20, left: 50, right: 150,
      width: 100, height: 20, x: 50, y: rectTop, toJSON: () => ({}),
    }));
    Range.prototype.getBoundingClientRect = getBoundingClientRectSpy as unknown as typeof Range.prototype.getBoundingClientRect;

    try {
      const { container } = render(<ParagraphBlockEditor value="bonjour" onChange={() => {}} formatting />);
      const editor = getEditor(container);
      fireEvent.focus(editor);
      selectRange(editor, 0, 7);

      const callsAfterSelect = getBoundingClientRectSpy.mock.calls.length;
      expect(callsAfterSelect).toBeGreaterThan(0);

      rectTop = 300; // simule le texte sélectionné qui a défilé ailleurs à l'écran
      fireEvent.scroll(window);

      expect(getBoundingClientRectSpy.mock.calls.length).toBeGreaterThan(callsAfterSelect);
    } finally {
      // @ts-expect-error -- retire le stub ajouté pour le test
      delete Range.prototype.getBoundingClientRect;
    }
  });

  it("masque la barre quand la sélection est perdue (blur)", () => {
    const { container } = render(<ParagraphBlockEditor value="bonjour" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 7);
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

  it("ne fait rien si la sélection traverse plusieurs paragraphes", () => {
    // Range.toString() ne pose aucun séparateur aux frontières de bloc — une
    // sélection multi-paragraphes donnerait un texte aplati, et
    // execCommand("insertHTML", …) sur cette même plage risquerait de
    // fusionner les blocs distincts. On refuse plutôt que de corrompre.
    const { container } = render(
      <ParagraphBlockEditor value={"premier\n\ndeuxième"} onChange={() => {}} formatting />,
    );
    const editor = getEditor(container);
    fireEvent.focus(editor);
    const blocks = editor.querySelectorAll("[data-block]");
    expect(blocks).toHaveLength(2);
    const range = document.createRange();
    range.setStart(blocks[0].firstChild as Text, 0);
    range.setEnd(blocks[1].firstChild as Text, 3);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.mouseUp(editor);
    fireEvent.mouseDown(screen.getByTitle("Gras"));
    expect(execCommandSpy).not.toHaveBeenCalled();
  });

  it("Barré entoure la sélection de ~~", () => {
    const { container } = render(<ParagraphBlockEditor value="oups" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 4);
    fireEvent.mouseDown(screen.getByTitle("Barré"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "~~oups~~");
  });

  it("Souligné utilise le marqueur ++texte++", () => {
    const { container } = render(<ParagraphBlockEditor value="important" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 9);
    fireEvent.mouseDown(screen.getByTitle("Souligné"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "++important++");
  });

  it("le dropdown Titre transforme tout le paragraphe, même avec une sélection partielle", () => {
    const { container } = render(<ParagraphBlockEditor value="mon titre" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    // Sélectionne seulement "titre" (pas tout le paragraphe) : le titre
    // doit quand même s'appliquer à l'ensemble du bloc.
    selectRange(editor, 4, 9);
    const headingButton = screen.getByTitle("Titre");
    // DropdownMenuTrigger (Radix) ouvre au pointerdown, pas au click — même
    // principe que le mousedown+click du bouton couleur, mais sur un autre
    // événement : il n'ouvre jamais lui-même l'état, seul Radix le fait.
    fireEvent.mouseDown(headingButton);
    fireEvent.pointerDown(headingButton, { button: 0 });
    fireEvent.click(screen.getByText("Titre 2"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "## mon titre");
  });

  it("Liste préfixe le bloc courant par \"- \"", () => {
    const { container } = render(<ParagraphBlockEditor value="une ligne" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 4);
    fireEvent.mouseDown(screen.getByTitle("Liste"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "- une ligne");
  });

  it("ouvre le popover de couleur au clic sur le bouton palette", () => {
    const { container } = render(<ParagraphBlockEditor value="rouge" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 5);
    // Un clic réel déclenche mousedown PUIS click — c'est ce dernier que
    // PopoverTrigger (Radix) écoute pour ouvrir le popover. Notre bouton
    // n'agit que sur mousedown (preventDefault + sauvegarde la sélection),
    // sans jamais ouvrir lui-même le popover : le faire aussi créerait un
    // double-toggle avec le onClick interne de Radix (ouvert par nous,
    // refermé aussitôt par Radix qui inverse l'état courant).
    const paletteButton = screen.getByTitle("Couleur du texte");
    fireEvent.mouseDown(paletteButton);
    fireEvent.click(paletteButton);
    expect(screen.getByText("Confirmer")).toBeInTheDocument();
  });

  it("le mousedown seul (sans click) n'ouvre pas le popover", () => {
    // Garde-fou contre le double-toggle : si onMouseDown ouvrait lui-même
    // le popover, le onClick de Radix (déclenché juste après par un clic
    // réel) l'inverserait aussitôt et le refermerait.
    const { container } = render(<ParagraphBlockEditor value="rouge" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 5);
    fireEvent.mouseDown(screen.getByTitle("Couleur du texte"));
    expect(screen.queryByText("Confirmer")).toBeNull();
  });

  it("le popover de couleur reste ouvert même si l'éditeur perd le focus", () => {
    // Ouvrir le popover fait perdre le focus au contentEditable (Radix y
    // déplace le focus) — la barre (et le popover qu'elle contient) ne
    // doit pas se démonter pour autant, sinon le popover disparaît avant
    // même que l'utilisateur ait pu choisir une couleur.
    const { container } = render(<ParagraphBlockEditor value="rouge" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 5);
    const paletteButton = screen.getByTitle("Couleur du texte");
    fireEvent.mouseDown(paletteButton);
    fireEvent.click(paletteButton);
    expect(screen.getByText("Confirmer")).toBeInTheDocument();

    fireEvent.blur(editor);
    expect(screen.getByText("Confirmer")).toBeInTheDocument();
    expect(screen.getByTitle("Gras")).toBeInTheDocument();
  });

  it("Confirmer applique le marqueur [#hex]texte[/] avec la couleur par défaut", () => {
    const { container } = render(<ParagraphBlockEditor value="rouge" onChange={() => {}} formatting />);
    const editor = getEditor(container);
    fireEvent.focus(editor);
    selectRange(editor, 0, 5);
    const paletteButton = screen.getByTitle("Couleur du texte");
    fireEvent.mouseDown(paletteButton);
    fireEvent.click(paletteButton);
    fireEvent.click(screen.getByText("Confirmer"));
    expect(execCommandSpy).toHaveBeenCalledWith("insertHTML", false, "[#b91c1c]rouge[/]");
  });
});
