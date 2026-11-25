import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useAutoSave } from "@/hooks/useAutoSave";

type Props = { value: number; valid: boolean };

function monter(save: (v: number) => Promise<boolean>, initial: Props = { value: 1, valid: true }) {
  return renderHook((p: Props) => useAutoSave({ value: p.value, valid: p.valid, save, delay: 800 }), {
    initialProps: initial,
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAutoSave", () => {
  it("n'enregistre rien au montage", async () => {
    const save = vi.fn().mockResolvedValue(true);
    monter(save);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(save).not.toHaveBeenCalled();
  });

  it("enregistre la dernière valeur après le délai sans changement", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { rerender, result } = monter(save);
    rerender({ value: 2, valid: true });
    await act(() => vi.advanceTimersByTimeAsync(500));
    rerender({ value: 3, valid: true });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(save).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3);
    expect(result.current.status).toBe("saved");
  });

  it("n'enregistre pas une valeur invalide, ni une valeur égale à la dernière enregistrée", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { rerender } = monter(save);
    rerender({ value: 2, valid: false });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    rerender({ value: 1, valid: true });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).not.toHaveBeenCalled();
  });

  it("flush enregistre tout de suite ce qui attend", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { rerender, result } = monter(save);
    rerender({ value: 2, valid: true });
    await act(async () => result.current.flush());
    expect(save).toHaveBeenCalledWith(2);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("enregistre au démontage ce qui attend encore", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { rerender, unmount } = monter(save);
    rerender({ value: 2, valid: true });
    unmount();
    expect(save).toHaveBeenCalledWith(2);
  });

  it("pas de requêtes concurrentes : la valeur arrivée pendant un envoi part ensuite", async () => {
    let finir: (ok: boolean) => void = () => {};
    const save = vi.fn().mockImplementationOnce(() => new Promise<boolean>((r) => (finir = r))).mockResolvedValue(true);
    const { rerender } = monter(save);
    rerender({ value: 2, valid: true });
    await act(() => vi.advanceTimersByTimeAsync(800));
    rerender({ value: 3, valid: true });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finir(true));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(3);
  });

  it("un échec passe en erreur et ne se relance pas tout seul", async () => {
    const save = vi.fn().mockResolvedValue(false);
    const { rerender, result } = monter(save);
    rerender({ value: 2, valid: true });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.status).toBe("error");
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).toHaveBeenCalledTimes(1);
  });
});
