import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { createRef, useState } from "react";

import { ParagraphBlockEditor, type ParagraphBlockEditorHandle } from "@/components/chatrooms/composer/ParagraphBlockEditor";

function getEditor(container: HTMLElement) {
  const el = container.querySelector("[contenteditable]");
  if (!el) throw new Error("editor introuvable");
  return el as HTMLDivElement;
}

/** Écrit `text` dans le premier bloc et place le curseur à `caret` (défaut : la fin). */
function typeInto(editor: HTMLDivElement, text: string, caret = text.length) {
  const block = editor.querySelector<HTMLElement>("[data-block]") ?? editor;
  block.innerHTML = "";
  const node = document.createTextNode(text);
  block.appendChild(node);
  const range = document.createRange();
  range.setStart(node, caret);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.input(editor);
  return node;
}

describe("ParagraphBlockEditor — mentions", () => {
  it("signale la saisie `@…` au curseur, et son effacement", () => {
    const onQuery = vi.fn();
    const { container } = render(<ParagraphBlockEditor value="" onChange={() => {}} mentions={{ onQuery }} />);
    const editor = getEditor(container);

    typeInto(editor, "Salut @al");
    expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({ query: "al" }));

    // Un nom de rôle avec espace reste une requête.
    typeInto(editor, "Salut @maitre du");
    expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({ query: "maitre du" }));

    typeInto(editor, "Salut alice");
    expect(onQuery).toHaveBeenLastCalledWith(null);
  });

  it("un @ collé à un mot (courriel) n'est pas une mention", () => {
    const onQuery = vi.fn();
    const { container } = render(<ParagraphBlockEditor value="" onChange={() => {}} mentions={{ onQuery }} />);
    typeInto(getEditor(container), "alice@example");
    expect(onQuery).not.toHaveBeenCalledWith(expect.objectContaining({ query: expect.any(String) }));
  });

  it("replaceMentionQuery remplace le `@query` par le texte choisi", () => {
    const onChange = vi.fn();
    const onQuery = vi.fn();
    const ref = createRef<ParagraphBlockEditorHandle>();
    // L'éditeur resynchronise son DOM sur `value` : le parent doit la suivre,
    // comme le composeur le fait.
    function Harness() {
      const [value, setValue] = useState("");
      return <ParagraphBlockEditor ref={ref} value={value} onChange={(v) => { setValue(v); onChange(v); }} mentions={{ onQuery }} />;
    }
    const { container } = render(<Harness />);
    const editor = getEditor(container);
    typeInto(editor, "Salut @al, ça va ?", "Salut @al".length);

    act(() => ref.current!.replaceMentionQuery("@alice "));

    expect(editor.textContent).toBe("Salut @alice , ça va ?");
    // jsdom n'implémente pas `innerText`, dont dépend la valeur rendue : on
    // vérifie seulement que le parent est prévenu.
    expect(onChange).toHaveBeenCalled();
    expect(onQuery).toHaveBeenLastCalledWith(null);
  });

  it("laisse le parent consommer les touches tant que sa liste est ouverte", () => {
    const onKeyDown = vi.fn();
    const mentionKey = vi.fn((e: React.KeyboardEvent) => {
      if (e.key === "Enter") return true;
      return false;
    });
    const { container } = render(
      <ParagraphBlockEditor value="" onChange={() => {}} onKeyDown={onKeyDown} mentions={{ onQuery: () => {}, onKeyDown: mentionKey }} />,
    );
    fireEvent.keyDown(getEditor(container), { key: "Enter" });
    expect(mentionKey).toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled(); // pas d'envoi : la liste a pris Entrée

    fireEvent.keyDown(getEditor(container), { key: "a" });
    expect(onKeyDown).toHaveBeenCalledTimes(1); // les autres touches suivent leur cours
  });
});
