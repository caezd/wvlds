import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useScrolledPast } from "@/hooks/useScrolledPast";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let callback: Callback | null = null;
let options: IntersectionObserverInit | undefined;
const observe = vi.fn();
const disconnect = vi.fn();
const original = window.IntersectionObserver;

beforeEach(() => {
  callback = null;
  observe.mockClear();
  disconnect.mockClear();
  window.IntersectionObserver = class {
    constructor(cb: Callback, opts?: IntersectionObserverInit) {
      callback = cb;
      options = opts;
    }
    observe = observe;
    unobserve() {}
    disconnect = disconnect;
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  window.IntersectionObserver = original;
});

function setup(topInset?: number) {
  const sentinel = document.createElement("div");
  const root = document.createElement("div");
  const hook = renderHook(
    ({ sentinel, root }: { sentinel: Element | null; root: Element | null }) => useScrolledPast(sentinel, root, topInset),
    { initialProps: { sentinel, root } },
  );
  return { ...hook, sentinel, root };
}

function fire(entry: { isIntersecting: boolean; bottom: number; rootTop?: number }) {
  act(() => {
    callback!([
      {
        isIntersecting: entry.isIntersecting,
        boundingClientRect: { bottom: entry.bottom } as DOMRectReadOnly,
        rootBounds: entry.rootTop === undefined ? null : ({ top: entry.rootTop } as DOMRectReadOnly),
      },
    ]);
  });
}

describe("useScrolledPast", () => {
  it("observe le repère dans la zone de défilement, rétrécie par le haut de la hauteur de la barre", () => {
    const { root, sentinel } = setup(56);

    expect(observe).toHaveBeenCalledWith(sentinel);
    expect(options?.rootMargin).toBe("-56px 0px 0px 0px");
    expect(options?.root).toBe(root);
  });

  it("est faux tant que le repère est visible", () => {
    const { result } = setup(56);
    expect(result.current).toBe(false);

    fire({ isIntersecting: true, bottom: 120, rootTop: 56 });
    expect(result.current).toBe(false);
  });

  it("devient vrai quand le repère est sorti sous la barre, et redevient faux quand il revient", () => {
    const { result } = setup(56);

    fire({ isIntersecting: false, bottom: 40, rootTop: 56 });
    expect(result.current).toBe(true);

    fire({ isIntersecting: true, bottom: 80, rootTop: 56 });
    expect(result.current).toBe(false);
  });

  it("ne compte pas comme passé un repère encore sous le bord BAS de la zone", () => {
    // Page jamais défilée mais repère hors de vue par le bas : pas un header.
    const { result } = setup(56);

    fire({ isIntersecting: false, bottom: 2000, rootTop: 56 });
    expect(result.current).toBe(false);
  });

  it("se rabat sur la hauteur de barre quand l'observateur ne fournit pas les bornes de la zone", () => {
    const { result } = setup(56);

    fire({ isIntersecting: false, bottom: 10 });
    expect(result.current).toBe(true);
  });

  it("repart de zéro et observe le nouvel élément quand le repère est remplacé", () => {
    // Régression : changer de vue démonte le repère et en remonte un autre au
    // retour. Une ref gardait l'ancien élément, détaché — signalé « hors de
    // vue, rectangle nul », donc passé pour toujours : la barre restait
    // affichée tout en haut de la page.
    const { result, rerender, root } = setup(56);
    fire({ isIntersecting: false, bottom: 40, rootTop: 56 });
    expect(result.current).toBe(true);

    const next = document.createElement("div");
    rerender({ sentinel: next, root });

    expect(result.current).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenLastCalledWith(next);
  });

  it("n'observe rien tant que le repère n'est pas monté", () => {
    renderHook(() => useScrolledPast(null, null, 56));
    expect(observe).not.toHaveBeenCalled();
  });

  it("libère l'observateur au démontage", () => {
    const { unmount } = setup();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
