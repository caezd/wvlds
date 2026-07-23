import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";

function getEditor(container: HTMLElement) {
  const el = container.querySelector("[contenteditable]");
  if (!el) throw new Error("editor introuvable");
  return el as HTMLElement;
}

describe("ParagraphBlockEditor — Entrée / invertEnter", () => {
  it("mode normal : Entrée seule déclenche onKeyDown (envoi)", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <ParagraphBlockEditor value="" onChange={() => {}} onKeyDown={onKeyDown} />,
    );
    fireEvent.keyDown(getEditor(container), { key: "Enter" });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it("mode normal : Maj+Entrée ne déclenche pas onKeyDown (saut de ligne)", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <ParagraphBlockEditor value="" onChange={() => {}} onKeyDown={onKeyDown} />,
    );
    fireEvent.keyDown(getEditor(container), { key: "Enter", shiftKey: true });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("mode normal : Ctrl+Entrée ne déclenche pas onKeyDown (saut de ligne)", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <ParagraphBlockEditor value="" onChange={() => {}} onKeyDown={onKeyDown} />,
    );
    fireEvent.keyDown(getEditor(container), { key: "Enter", ctrlKey: true });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("mode inversé (mobile) : Entrée seule ne déclenche pas onKeyDown (saut de ligne)", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <ParagraphBlockEditor value="" onChange={() => {}} onKeyDown={onKeyDown} invertEnter />,
    );
    fireEvent.keyDown(getEditor(container), { key: "Enter" });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("mode inversé (mobile) : Maj+Entrée déclenche onKeyDown (envoi)", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <ParagraphBlockEditor value="" onChange={() => {}} onKeyDown={onKeyDown} invertEnter />,
    );
    fireEvent.keyDown(getEditor(container), { key: "Enter", shiftKey: true });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it("mode inversé (mobile) : Ctrl+Entrée déclenche onKeyDown (envoi)", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <ParagraphBlockEditor value="" onChange={() => {}} onKeyDown={onKeyDown} invertEnter />,
    );
    fireEvent.keyDown(getEditor(container), { key: "Enter", ctrlKey: true });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it("les touches autres qu'Entrée sont toujours relayées telles quelles", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <ParagraphBlockEditor value="" onChange={() => {}} onKeyDown={onKeyDown} invertEnter />,
    );
    fireEvent.keyDown(getEditor(container), { key: "ArrowUp" });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it("submitOnEnter=false : Entrée ne déclenche jamais onKeyDown, même inversé", () => {
    const onKeyDown = vi.fn();
    const { container } = render(
      <ParagraphBlockEditor
        value=""
        onChange={() => {}}
        onKeyDown={onKeyDown}
        submitOnEnter={false}
        invertEnter
      />,
    );
    fireEvent.keyDown(getEditor(container), { key: "Enter", shiftKey: true });
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});

describe("ParagraphBlockEditor — positionnement du curseur dans [data-block]", () => {
  // Régression : `selectNodeContents(el).collapse(false)` place le curseur au
  // niveau de l'éditeur racine (après le dernier enfant), pas à l'intérieur
  // du bloc — la première lettre tapée s'insérait alors comme nœud texte en
  // dehors du paragraphe (cf. composer mobile, autoFocus à l'ouverture du drawer).
  it("autoFocus au montage : le curseur est à l'intérieur du bloc, pas au niveau de l'éditeur", () => {
    const { container } = render(
      <ParagraphBlockEditor value="" onChange={() => {}} autoFocus />,
    );
    const editor = getEditor(container);
    const block = editor.querySelector("[data-block]");
    expect(block).not.toBeNull();

    const sel = window.getSelection();
    expect(sel?.anchorNode).not.toBe(editor);
    expect(block === sel?.anchorNode || block!.contains(sel?.anchorNode ?? null)).toBe(true);
  });

  it("sync externe (value non vide) : le curseur est aussi placé dans le dernier bloc", () => {
    const { container, rerender } = render(
      <ParagraphBlockEditor value="" onChange={() => {}} />,
    );
    rerender(<ParagraphBlockEditor value="Bonjour" onChange={() => {}} />);

    const editor = getEditor(container);
    const blocks = editor.querySelectorAll("[data-block]");
    const lastBlock = blocks[blocks.length - 1];
    expect(lastBlock).not.toBeUndefined();

    const sel = window.getSelection();
    expect(sel?.anchorNode).not.toBe(editor);
    expect(lastBlock === sel?.anchorNode || lastBlock.contains(sel?.anchorNode ?? null)).toBe(true);
  });
});
