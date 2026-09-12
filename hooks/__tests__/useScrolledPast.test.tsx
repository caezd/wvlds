import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";

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
  return renderHook(() => {
    const sentinelRef = useRef<Element | null>(sentinel);
    const rootRef = useRef<Element | null>(root);
    return useScrolledPast(sentinelRef, rootRef, topInset);
  });
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
    setup(56);

    expect(observe).toHaveBeenCalledTimes(1);
    expect(options?.rootMargin).toBe("-56px 0px 0px 0px");
    expect(options?.root).toBeInstanceOf(HTMLElement);
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

  it("libère l'observateur au démontage", () => {
    const { unmount } = setup();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
