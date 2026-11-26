import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useUsernameAvailability (migration 266)", () => {
  it("un pseudo mal formé est signalé sans interroger la base", async () => {
    const { result } = renderHook(() => useUsernameAvailability("mon pseudo", { delay: 0 }));
    expect(result.current).toEqual({ status: "invalid", problem: "spaces" });
    await new Promise((r) => setTimeout(r, 10));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("vide : au repos", () => {
    const { result } = renderHook(() => useUsernameAvailability("", { delay: 0 }));
    expect(result.current.status).toBe("idle");
  });

  it("bien formé : vérifie, puis dit libre", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => useUsernameAvailability("Lia_92", { delay: 0 }));
    expect(result.current.status).toBe("checking");
    await waitFor(() => expect(result.current.status).toBe("available"));
    expect(rpc).toHaveBeenCalledWith("is_username_available", { p_username: "Lia_92" });
  });

  it("déjà pris", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { result } = renderHook(() => useUsernameAvailability("Brom", { delay: 0 }));
    await waitFor(() => expect(result.current.status).toBe("taken"));
  });

  it("une erreur de la base se dit telle", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useUsernameAvailability("Brom", { delay: 0 }));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("attend la fin de la frappe : une seule requête pour la dernière valeur", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { result, rerender } = renderHook(({ v }) => useUsernameAvailability(v, { delay: 30 }), {
      initialProps: { v: "Lia" },
    });
    rerender({ v: "Lia_" });
    rerender({ v: "Lia_9" });
    await waitFor(() => expect(result.current.status).toBe("available"));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("is_username_available", { p_username: "Lia_9" });
  });

  it("une réponse arrivée trop tard pour une ancienne valeur est ignorée", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    rpc
      .mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }))
      .mockResolvedValueOnce({ data: false, error: null });
    const { result, rerender } = renderHook(({ v }) => useUsernameAvailability(v, { delay: 0 }), {
      initialProps: { v: "Ancien" },
    });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    rerender({ v: "Nouveau" });
    await waitFor(() => expect(result.current.status).toBe("taken"));
    resolveOld({ data: true, error: null });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.status).toBe("taken");
  });
});
