import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Socket Realtime factice : `disconnect` et `connectionState` sont remplacés
// test par test pour observer l'ordre fermeture → incrément.
const realtime = vi.hoisted(() => ({
  disconnect: vi.fn(() => Promise.resolve("ok")),
  connectionState: vi.fn(() => "closed"),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ realtime }),
}));

import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";

// Le hook maintient un état de module (epoch, écouteurs) partagé par tous
// les composants qui l'utilisent, et ses écouteurs sont branchés sur window
// et document pour la vie de la page. Réimporter le module à chaque test
// n'y changerait rien — les écouteurs des instances précédentes resteraient
// branchés et se déclencheraient aussi. On garde donc une seule instance et
// des assertions RELATIVES à l'epoch de départ.

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setHidden(false);
  realtime.disconnect.mockReset().mockImplementation(() => Promise.resolve("ok"));
  realtime.connectionState.mockReset().mockImplementation(() => "closed");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useReconnectEpoch", () => {
  it("incrémente quand le navigateur repasse en ligne", async () => {
    const { result } = renderHook(() => useReconnectEpoch());
    const avant = result.current;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(avant + 1);
  });

  it("incrémente quand l'onglet redevient visible après une longue absence", async () => {
    const { result } = renderHook(() => useReconnectEpoch());
    const avant = result.current;

    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(avant);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(avant + 1);
  });

  it("n'incrémente pas pour un passage en arrière-plan bref", async () => {
    const { result } = renderHook(() => useReconnectEpoch());
    const avant = result.current;

    await act(async () => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(2_000);
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(avant);
    expect(realtime.disconnect).not.toHaveBeenCalled();
  });

  it("propage l'incrément à toutes les instances montées", async () => {
    const a = renderHook(() => useReconnectEpoch());
    const b = renderHook(() => useReconnectEpoch());
    const avant = a.result.current;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(a.result.current).toBe(avant + 1);
    expect(b.result.current).toBe(avant + 1);
  });

  it("ferme la socket Realtime AVANT d'incrémenter", async () => {
    // Une socket zombie accepte encore les envois : recréer les canaux sans
    // l'avoir fermée, c'est les faire rejoindre dans le vide jusqu'au
    // heartbeat. L'incrément attend donc la fermeture.
    let terminer!: () => void;
    realtime.disconnect.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          terminer = () => resolve("ok");
        }),
    );
    const { result } = renderHook(() => useReconnectEpoch());
    const avant = result.current;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(realtime.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(avant);

    await act(async () => {
      terminer();
    });
    expect(result.current).toBe(avant + 1);
  });

  it("attend la fermeture effective quand une fermeture est déjà en cours", async () => {
    // `disconnect()` rend la main aussitôt si la socket est déjà en train de
    // se fermer ; `connect()` refuserait alors d'ouvrir. On patiente.
    realtime.connectionState
      .mockImplementationOnce(() => "closing")
      .mockImplementationOnce(() => "closing")
      .mockImplementation(() => "closed");
    const { result } = renderHook(() => useReconnectEpoch());
    const avant = result.current;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(avant);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(result.current).toBe(avant + 1);
  });

  it("mène un seul cycle pour des signaux de réveil groupés", async () => {
    // Au réveil d'une PWA, `online` et `visibilitychange` arrivent ensemble.
    let terminer!: () => void;
    realtime.disconnect.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          terminer = () => resolve("ok");
        }),
    );
    const { result } = renderHook(() => useReconnectEpoch());
    const avant = result.current;

    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
      window.dispatchEvent(new Event("online"));
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(realtime.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      terminer();
    });
    expect(result.current).toBe(avant + 1);
  });

  it("incrémente quand même si la fermeture de la socket échoue", async () => {
    realtime.disconnect.mockImplementation(() => Promise.reject(new Error("boom")));
    const { result } = renderHook(() => useReconnectEpoch());
    const avant = result.current;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(avant + 1);
  });
});
