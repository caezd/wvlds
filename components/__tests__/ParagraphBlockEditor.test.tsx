import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ParagraphBlockEditor } from "@/components/chatrooms/ParagraphBlockEditor";

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
