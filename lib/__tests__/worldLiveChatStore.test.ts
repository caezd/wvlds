import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  registerLiveChatWorld,
  useLiveChatWorldId,
  __resetLiveChatWorlds,
} from "@/lib/worldLiveChatStore";

/** Laisse passer la microtâche qui publie le nouvel état. */
const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => __resetLiveChatWorlds());

describe("worldLiveChatStore", () => {
  it("vaut null tant qu'aucun monde n'est déclaré", () => {
    const { result } = renderHook(() => useLiveChatWorldId());
    expect(result.current).toBeNull();
  });

  it("publie le monde déclaré, puis null après son retrait", async () => {
    const { result } = renderHook(() => useLiveChatWorldId());
    const off = registerLiveChatWorld("w1");
    await flush();
    expect(result.current).toBe("w1");
    off();
    await flush();
    expect(result.current).toBeNull();
  });

  it("le dernier inscrit l'emporte, et le précédent reprend à son retrait", async () => {
    const { result } = renderHook(() => useLiveChatWorldId());
    registerLiveChatWorld("w1");
    const off2 = registerLiveChatWorld("w2");
    await flush();
    expect(result.current).toBe("w2");
    off2();
    await flush();
    expect(result.current).toBe("w1");
  });

  it("une navigation monde → salon du même monde ne passe jamais par null", async () => {
    const seen: (string | null)[] = [];
    renderHook(() => {
      const id = useLiveChatWorldId();
      seen.push(id);
      return id;
    });
    const off = registerLiveChatWorld("w1");
    await flush();
    // Démontage de l'ancien layout et montage du nouveau dans le même passage.
    off();
    registerLiveChatWorld("w1");
    await flush();
    expect(seen.filter((v, i) => i === 0 || v !== seen[i - 1])).toEqual([null, "w1"]);
  });
});
