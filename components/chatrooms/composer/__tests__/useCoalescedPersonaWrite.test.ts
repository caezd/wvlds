import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useCoalescedPersonaWrite } from "../useCoalescedPersonaWrite";

describe("useCoalescedPersonaWrite", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (error: { message: string } | null = null) => {
    const save = vi.fn(() => Promise.resolve({ error }));
    const onFailed = vi.fn();
    const hook = renderHook(() => useCoalescedPersonaWrite<string | null, string>(save, onFailed, 400));
    return { save, onFailed, schedule: hook.result.current, unmount: hook.unmount };
  };

  it("une rafale de changements ne produit qu'une écriture, avec la dernière valeur", async () => {
    const { save, schedule } = setup();
    act(() => {
      for (const c of ["#100000", "#200000", "#300000", "#400000"]) schedule("p1", c, "#000000", "avant");
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("p1", "#400000");
  });

  it("revenir à la valeur enregistrée n'écrit rien", async () => {
    const { save, schedule } = setup();
    act(() => {
      schedule("p1", "#ff0000", "#000000", "avant");
      schedule("p1", "#000000", "#000000", "avant");
    });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(save).not.toHaveBeenCalled();
  });

  it("changer de persona écrit aussitôt la valeur en attente de la précédente", () => {
    const { save, schedule } = setup();
    act(() => {
      schedule("p1", "#ff0000", null, "avant");
      schedule("p2", "#00ff00", null, "avant");
    });
    expect(save).toHaveBeenCalledWith("p1", "#ff0000");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("le démontage écrit la valeur en attente", () => {
    const { save, schedule, unmount } = setup();
    act(() => schedule("p1", "#ff0000", null, "avant"));
    unmount();
    expect(save).toHaveBeenCalledWith("p1", "#ff0000");
  });

  it("un échec rend l'état d'avant la rafale", async () => {
    const { onFailed, schedule } = setup({ message: "refusé" });
    act(() => {
      schedule("p1", "#100000", null, "avant");
      schedule("p1", "#200000", null, "ignoré");
    });
    await act(async () => { vi.advanceTimersByTime(400); });
    await act(async () => {});
    expect(onFailed).toHaveBeenCalledWith("p1", "avant", "refusé");
  });
});
