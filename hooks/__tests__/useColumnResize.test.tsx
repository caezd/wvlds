import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useColumnResize } from "@/hooks/useColumnResize";

/** Un événement pointeur réduit à ce que le hook en lit. */
function pointeur(clientX: number) {
  return {
    clientX,
    pointerId: 1,
    currentTarget: { setPointerCapture: vi.fn() },
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

function monter(over: Partial<Parameters<typeof useColumnResize>[0]> = {}) {
  const onCommit = vi.fn();
  const vue = renderHook(() =>
    useColumnResize({
      initialWidth: 200,
      min: 120,
      max: 360,
      side: "right",
      onCommit,
      ...over,
    }),
  );
  return { ...vue, onCommit };
}

/** Glisse de `de` à `vers`, sans relâcher si `relacher` est faux. */
function glisser(
  result: { current: ReturnType<typeof useColumnResize> },
  de: number,
  vers: number,
  relacher = true,
) {
  act(() => { result.current.handleProps.onPointerDown(pointeur(de)); });
  act(() => { result.current.handleProps.onPointerMove(pointeur(vers)); });
  if (relacher) act(() => { result.current.handleProps.onPointerUp(pointeur(vers)); });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useColumnResize", () => {
  it("part de la largeur fournie", () => {
    expect(monter().result.current.width).toBe(200);
  });

  it("élargit une colonne de gauche quand on tire vers la droite", () => {
    const { result } = monter({ side: "right" });
    glisser(result, 0, 40);
    expect(result.current.width).toBe(240);
  });

  it("élargit une colonne de droite quand on tire vers la gauche", () => {
    // La poignée est de l'autre côté : le même geste doit produire l'inverse,
    // sans quoi le panneau rétrécirait quand on cherche à l'agrandir.
    const { result } = monter({ side: "left" });
    glisser(result, 0, -40);
    expect(result.current.width).toBe(240);
  });

  it("respecte le plancher et le plafond", () => {
    const { result } = monter();
    glisser(result, 0, -500);
    expect(result.current.width).toBe(120);
    glisser(result, 0, 500);
    expect(result.current.width).toBe(360);
  });

  it("suit le pointeur sans rien enregistrer tant qu'on n'a pas relâché", () => {
    const { result, onCommit } = monter();
    glisser(result, 0, 40, false);

    expect(result.current.width).toBe(240);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("n'enregistre qu'après un temps d'arrêt", () => {
    const { result, onCommit } = monter();
    glisser(result, 0, 40);

    expect(onCommit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(600); });
    expect(onCommit).toHaveBeenCalledWith(240);
  });

  it("n'enregistre qu'une fois pour une suite de glissements rapprochés", () => {
    // Sans ce regroupement, une seule intention produirait autant d'écritures
    // que d'allers-retours de la souris.
    const { result, onCommit } = monter();
    glisser(result, 0, 40);
    glisser(result, 0, 60);
    act(() => { vi.advanceTimersByTime(600); });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(300);
  });

  it("ignore un déplacement qui ne suit aucune prise", () => {
    const { result } = monter();
    act(() => { result.current.handleProps.onPointerMove(pointeur(400)); });
    expect(result.current.width).toBe(200);
  });

  it("traite l'annulation du pointeur comme un relâchement", () => {
    const { result, onCommit } = monter();
    act(() => { result.current.handleProps.onPointerDown(pointeur(0)); });
    act(() => { result.current.handleProps.onPointerCancel(pointeur(40)); });
    act(() => { vi.advanceTimersByTime(600); });

    // Un glissement interrompu — le pointeur quitte la fenêtre — doit laisser
    // la colonne à sa largeur, pas en attente d'un relâchement qui ne viendra pas.
    expect(result.current.width).toBe(240);
    expect(onCommit).toHaveBeenCalledWith(240);
  });

  it("n'enregistre plus après démontage", () => {
    const { result, onCommit, unmount } = monter();
    glisser(result, 0, 40);
    unmount();
    act(() => { vi.advanceTimersByTime(600); });

    expect(onCommit).not.toHaveBeenCalled();
  });
});
