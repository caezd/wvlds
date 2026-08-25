import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLongPress } from "../useLongPress";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** Simule un drawer monté (ouvert, ou en cours d'animation de fermeture) :
 *  c'est ce marqueur que le hook cherche pour savoir qu'un panneau capte
 *  déjà les gestes de l'utilisateur (voir components/ui/drawer.tsx). */
function mountDrawer() {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "drawer-viewport");
  document.body.appendChild(el);
  return () => el.remove();
}

describe("useLongPress", () => {
  it("déclenche le callback après le délai si touchend n'intervient jamais", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onTouchStart();
    vi.advanceTimersByTime(500);

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("n'appelle pas le callback si touchend intervient avant le délai", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onTouchStart();
    result.current.onTouchEnd();
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  // Régression : un enfant (ex. le déclencheur d'une sheet persona) peut
  // ouvrir un portail/overlay qui absorbe la suite du geste tactile, de
  // sorte que `touchend` n'atteint jamais ce niveau — seul le `click`
  // synthétisé par le navigateur bulle encore jusqu'ici. Sans annulation
  // dans `onClick`, le timer reste actif et déclenche le long-press bien
  // plus tard, sans rapport avec le tap qui vient de se produire (ex. juste
  // après avoir fermé une sheet ouverte depuis ce même message).
  it("annule le timer en attente dès qu'un clic atteint ce niveau, même sans touchend préalable", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onTouchStart();
    result.current.onClick({ preventDefault: vi.fn() } as unknown as React.MouseEvent);
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("empêche le clic qui suit un long-press déjà déclenché", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    const preventDefault = vi.fn();

    result.current.onTouchStart();
    vi.advanceTimersByTime(500);
    result.current.onClick({ preventDefault } as unknown as React.MouseEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  // Régression, cause racine : un portail React sort son contenu du DOM du
  // parent mais PAS de l'arbre React — les événements synthétiques y
  // remontent quand même. Un appui dans un drawer ouvert depuis cet élément
  // atteint donc `onTouchStart` comme s'il venait de l'élément lui-même.
  // Seul le DOM réel permet de faire la différence.
  it("n'arme pas le minuteur pour un appui venu d'un portail (hors du DOM de l'élément)", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    const element = document.createElement("div"); // l'élément écouteur
    document.body.appendChild(element);
    const portalContent = document.createElement("button"); // porté ailleurs
    document.body.appendChild(portalContent);

    result.current.onTouchStart({
      currentTarget: element,
      target: portalContent,
    } as unknown as React.TouchEvent);
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("arme bien le minuteur pour un appui réellement posé sur l'élément", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    const element = document.createElement("div");
    const child = document.createElement("span"); // vrai descendant DOM
    element.appendChild(child);
    document.body.appendChild(element);

    result.current.onTouchStart({
      currentTarget: element,
      target: child,
    } as unknown as React.TouchEvent);
    vi.advanceTimersByTime(500);

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("ne déclenche pas si un drawer s'ouvre pendant l'appui", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onTouchStart();
    mountDrawer(); // le tap a ouvert un drawer, doigt encore posé
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });

});
