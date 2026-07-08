import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { useTagChips } from "@/hooks/useTagChips";

function fakeKeyDownEvent(key: string, isComposing = false) {
  return {
    key,
    nativeEvent: { isComposing },
    preventDefault: () => {},
  } as unknown as KeyboardEvent<HTMLInputElement>;
}

describe("useTagChips", () => {
  it("démarre désactivé (tags === null) par défaut", () => {
    const { result } = renderHook(() => useTagChips());
    expect(result.current.tags).toBeNull();
  });

  it("toggle active la section (tableau vide) puis la désactive (null)", () => {
    const { result } = renderHook(() => useTagChips());

    act(() => result.current.toggle());
    expect(result.current.tags).toEqual([]);

    act(() => result.current.toggle());
    expect(result.current.tags).toBeNull();
  });

  it("add ajoute un tag et vide le champ de saisie", () => {
    const { result } = renderHook(() => useTagChips([]));

    act(() => result.current.setInput("violence"));
    act(() => result.current.add(result.current.input));

    expect(result.current.tags).toEqual(["violence"]);
    expect(result.current.input).toBe("");
  });

  it("ignore un ajout vide ou composé uniquement d'espaces", () => {
    const { result } = renderHook(() => useTagChips([]));

    act(() => result.current.add("   "));
    expect(result.current.tags).toEqual([]);
  });

  it("dédoublonne les tags de façon insensible à la casse", () => {
    const { result } = renderHook(() => useTagChips(["violence"]));

    act(() => result.current.add("Violence"));
    expect(result.current.tags).toEqual(["violence"]);
  });

  it("remove retire uniquement le tag ciblé", () => {
    const { result } = renderHook(() => useTagChips(["violence", "deuil"]));

    act(() => result.current.remove("violence"));
    expect(result.current.tags).toEqual(["deuil"]);
  });

  it("onKeyDown confirme un tag sur Entrée et sur virgule", () => {
    const { result } = renderHook(() => useTagChips([]));

    act(() => result.current.setInput("violence"));
    act(() => result.current.onKeyDown(fakeKeyDownEvent("Enter")));
    expect(result.current.tags).toEqual(["violence"]);

    act(() => result.current.setInput("deuil"));
    act(() => result.current.onKeyDown(fakeKeyDownEvent(",")));
    expect(result.current.tags).toEqual(["violence", "deuil"]);
  });

  it("onKeyDown ignore Entrée pendant une composition IME", () => {
    const { result } = renderHook(() => useTagChips([]));

    act(() => result.current.setInput("日本語"));
    act(() => result.current.onKeyDown(fakeKeyDownEvent("Enter", true)));

    expect(result.current.tags).toEqual([]);
    expect(result.current.input).toBe("日本語");
  });

  it("reset remplace la liste et vide le champ de saisie", () => {
    const { result } = renderHook(() => useTagChips(["violence"]));

    act(() => result.current.setInput("brouillon"));
    act(() => result.current.reset(["deuil"]));

    expect(result.current.tags).toEqual(["deuil"]);
    expect(result.current.input).toBe("");
  });
});
