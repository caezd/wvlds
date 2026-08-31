import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useLongPress } from "@/hooks/useLongPress";

// ──────────────────────────────────────────────────────────────────────────
// Appui long tactile : ouvre le tiroir d'actions d'un message, et le menu d'un
// monde dans le rail. Le hook n'avait aucun test, et portait deux défauts.
//
// 1. Le geste était abandonné au MOINDRE `touchmove`. Un doigt posé sur un
//    écran ne tient jamais parfaitement immobile — l'appui long échouait donc
//    souvent sans raison apparente.
//
// 2. Aucun nettoyage au démontage : un composant retiré pendant l'appui
//    laissait son minuteur courir, et le rappel partait ensuite dans le vide.
//    Côté message, cela faisait vibrer le téléphone pour un message disparu.
// ──────────────────────────────────────────────────────────────────────────

/** Événement tactile minimal, avec la position du doigt. */
function toucher(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] } as unknown as React.TouchEvent;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useLongPress", () => {
  it("déclenche après le délai", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart(toucher(100, 100)));
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("abandonne si le doigt se lève avant le délai", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart(toucher(100, 100)));
    act(() => void vi.advanceTimersByTime(400));
    act(() => result.current.onTouchEnd());
    act(() => void vi.advanceTimersByTime(500));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("tolère un micro-mouvement du doigt", () => {
    // LE défaut : un tremblement de quelques pixels annulait le geste.
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart(toucher(100, 100)));
    act(() => result.current.onTouchMove(toucher(103, 104))); // 5 px
    act(() => void vi.advanceTimersByTime(500));

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("abandonne dès qu'il s'agit d'un défilement", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart(toucher(100, 100)));
    act(() => result.current.onTouchMove(toucher(100, 140))); // 40 px
    act(() => void vi.advanceTimersByTime(500));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("mesure l'écart depuis le point de DÉPART, pas depuis le dernier point", () => {
    // Une dérive lente, point par point, reste un défilement : chaque pas fait
    // moins de 10 px mais le total en fait 30.
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart(toucher(100, 100)));
    for (const y of [106, 112, 118, 124, 130]) {
      act(() => result.current.onTouchMove(toucher(100, y)));
    }
    act(() => void vi.advanceTimersByTime(500));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("ignore un appui venu d'un portail rendu sous l'élément", () => {
    // Un drawer ouvert depuis cet élément sort du DOM par un portail, mais pas
    // de l'arbre React : ses événements tactiles remontent quand même ici. On
    // repart donc du DOM réel pour ne s'armer que sur un appui posé sur
    // l'élément lui-même.
    const hote = document.createElement("div");
    const dehors = document.createElement("div");
    document.body.append(hote, dehors);

    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() =>
      result.current.onTouchStart({
        ...toucher(100, 100),
        currentTarget: hote,
        target: dehors,
      } as unknown as React.TouchEvent),
    );
    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();

    // Le même appui, posé DANS l'élément, s'arme normalement.
    act(() =>
      result.current.onTouchStart({
        ...toucher(100, 100),
        currentTarget: hote,
        target: hote,
      } as unknown as React.TouchEvent),
    );
    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).toHaveBeenCalledTimes(1);

    hote.remove();
    dehors.remove();
  });

  it("n'ouvre pas son menu si un drawer s'est ouvert pendant l'appui", () => {
    // Cas restant : l'appui a bien commencé sur l'élément, mais a ouvert un
    // drawer entre-temps (tap sur l'avatar, doigt encore posé).
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart(toucher(100, 100)));

    const drawer = document.createElement("div");
    drawer.setAttribute("data-slot", "drawer-viewport");
    document.body.append(drawer);
    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();

    drawer.remove();
  });

  it("ne déclenche plus rien après démontage", () => {
    // Sans nettoyage, le minuteur survivait au composant : le rappel partait
    // dans le vide, et le téléphone vibrait pour un message disparu.
    const onLongPress = vi.fn();
    const { result, unmount } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart(toucher(100, 100)));
    unmount();
    act(() => void vi.advanceTimersByTime(500));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("empêche le clic qui suit un appui long, une seule fois", () => {
    // Sur mobile, relâcher le doigt émet aussi un clic : sans cela, un appui
    // long sur un lien ouvrirait le menu ET naviguerait.
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart(toucher(100, 100)));
    act(() => void vi.advanceTimersByTime(500));

    const clicApres = { preventDefault: vi.fn() } as unknown as React.MouseEvent;
    act(() => result.current.onClick(clicApres));
    expect(clicApres.preventDefault).toHaveBeenCalled();

    // Le clic SUIVANT, lui, doit passer : c'est un vrai clic.
    const clicNormal = { preventDefault: vi.fn() } as unknown as React.MouseEvent;
    act(() => result.current.onClick(clicNormal));
    expect(clicNormal.preventDefault).not.toHaveBeenCalled();
  });

  it("laisse passer le clic quand aucun appui long n'a eu lieu", () => {
    const { result } = renderHook(() => useLongPress(vi.fn(), 500));

    act(() => result.current.onTouchStart(toucher(100, 100)));
    act(() => result.current.onTouchEnd());

    const clic = { preventDefault: vi.fn() } as unknown as React.MouseEvent;
    act(() => result.current.onClick(clic));
    expect(clic.preventDefault).not.toHaveBeenCalled();
  });

  it("bloque le menu contextuel natif seulement après un appui long", () => {
    const { result } = renderHook(() => useLongPress(vi.fn(), 500));

    const avant = { preventDefault: vi.fn() } as unknown as React.MouseEvent;
    act(() => result.current.onContextMenu(avant));
    expect(avant.preventDefault).not.toHaveBeenCalled();

    act(() => result.current.onTouchStart(toucher(100, 100)));
    act(() => void vi.advanceTimersByTime(500));

    const apres = { preventDefault: vi.fn() } as unknown as React.MouseEvent;
    act(() => result.current.onContextMenu(apres));
    expect(apres.preventDefault).toHaveBeenCalled();
  });

  it("garde l'ancien comportement si l'appelant ne transmet pas l'événement", () => {
    // Rétrocompatibilité : sans point de départ connu, tout mouvement abandonne.
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, 500));

    act(() => result.current.onTouchStart());
    act(() => result.current.onTouchMove(toucher(100, 101))); // 1 px
    act(() => void vi.advanceTimersByTime(500));

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
