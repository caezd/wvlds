import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Le hook maintient un état de module (epoch, listeners, wired) partagé par
// tous les composants qui l'utilisent : on réimporte à neuf à chaque test
// pour repartir d'un état propre.
async function loadHook() {
  vi.resetModules();
  const mod = await import("@/hooks/useReconnectEpoch");
  return mod.useReconnectEpoch;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setHidden(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useReconnectEpoch", () => {
  it("incrémente quand le navigateur repasse en ligne", async () => {
    const useReconnectEpoch = await loadHook();
    const { result } = renderHook(() => useReconnectEpoch());
    expect(result.current).toBe(0);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(1);
  });

  it("incrémente quand l'onglet redevient visible après une longue absence", async () => {
    const useReconnectEpoch = await loadHook();
    const { result } = renderHook(() => useReconnectEpoch());

    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(20_000);
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(1);
  });

  it("n'incrémente pas pour un passage en arrière-plan bref", async () => {
    const useReconnectEpoch = await loadHook();
    const { result } = renderHook(() => useReconnectEpoch());

    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(2_000);
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(0);
  });

  it("propage l'incrément à toutes les instances montées", async () => {
    const useReconnectEpoch = await loadHook();
    const a = renderHook(() => useReconnectEpoch());
    const b = renderHook(() => useReconnectEpoch());

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(a.result.current).toBe(1);
    expect(b.result.current).toBe(1);
  });
});
